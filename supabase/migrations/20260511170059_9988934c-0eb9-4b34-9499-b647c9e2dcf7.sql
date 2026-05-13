-- Add stripe_price_id mapping to plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT UNIQUE;

UPDATE public.subscription_plans SET stripe_price_id = 'basico_monthly' WHERE name = 'Básico';
UPDATE public.subscription_plans SET stripe_price_id = 'profesional_monthly' WHERE name = 'Profesional';

-- Subscriptions table (Stripe-linked)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env ON public.subscriptions(user_id, environment);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions stripe" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Active subscription helper
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid UUID, check_env TEXT DEFAULT 'sandbox')
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

-- Resolve user's effective plan limits (falls back to free plan)
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(user_uuid UUID, check_env TEXT DEFAULT 'sandbox')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_price TEXT;
  plan_features jsonb;
BEGIN
  SELECT s.price_id INTO active_price
  FROM public.subscriptions s
  WHERE s.user_id = user_uuid
    AND s.environment = check_env
    AND (
      (s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status = 'canceled' AND s.current_period_end > now())
    )
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF active_price IS NOT NULL THEN
    SELECT features INTO plan_features
    FROM public.subscription_plans
    WHERE stripe_price_id = active_price
    LIMIT 1;
    IF plan_features IS NOT NULL THEN RETURN plan_features; END IF;
  END IF;

  -- Fallback: free plan
  SELECT features INTO plan_features
  FROM public.subscription_plans
  WHERE name = 'Gratuito'
  LIMIT 1;

  RETURN COALESCE(plan_features, '{"income_limit":5,"expense_limit":5,"declarations":1}'::jsonb);
END;
$$;

-- Enforce monthly limits on income/expense inserts (UPDATEs not affected)
CREATE OR REPLACE FUNCTION public.enforce_income_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limits jsonb;
  max_count INTEGER;
  current_count INTEGER;
BEGIN
  limits := public.get_user_plan_limits(NEW.user_id);
  max_count := COALESCE((limits->>'income_limit')::int, 5);
  IF max_count = -1 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.income_records
  WHERE user_id = NEW.user_id
    AND period_year = NEW.period_year
    AND period_month = NEW.period_month
    AND status = 'active';

  IF current_count >= max_count THEN
    RAISE EXCEPTION 'PLAN_LIMIT_INCOME: Has alcanzado el límite mensual de % ingresos de tu plan. Actualiza para registrar más.', max_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_expense_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limits jsonb;
  max_count INTEGER;
  current_count INTEGER;
BEGIN
  limits := public.get_user_plan_limits(NEW.user_id);
  max_count := COALESCE((limits->>'expense_limit')::int, 5);
  IF max_count = -1 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.expense_records
  WHERE user_id = NEW.user_id
    AND period_year = NEW.period_year
    AND period_month = NEW.period_month
    AND status = 'active';

  IF current_count >= max_count THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXPENSE: Has alcanzado el límite mensual de % gastos de tu plan. Actualiza para registrar más.', max_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_income_limit_trg ON public.income_records;
CREATE TRIGGER enforce_income_limit_trg
  BEFORE INSERT ON public.income_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_income_limit();

DROP TRIGGER IF EXISTS enforce_expense_limit_trg ON public.expense_records;
CREATE TRIGGER enforce_expense_limit_trg
  BEFORE INSERT ON public.expense_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_limit();