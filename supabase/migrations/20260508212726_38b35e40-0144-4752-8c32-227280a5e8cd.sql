
CREATE TABLE public.tax_calculations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  taxpayer_profile_id UUID,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  total_income NUMERIC NOT NULL DEFAULT 0,
  total_expenses NUMERIC NOT NULL DEFAULT 0,
  taxable_base NUMERIC NOT NULL DEFAULT 0,
  estimated_tax NUMERIC NOT NULL DEFAULT 0,
  applied_rate NUMERIC NOT NULL DEFAULT 0,
  calculation_version TEXT NOT NULL DEFAULT 'resico-v1',
  breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_year, period_month)
);

CREATE INDEX idx_tax_calc_user_period ON public.tax_calculations(user_id, period_year, period_month);

ALTER TABLE public.tax_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calculations"
ON public.tax_calculations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own calculations"
ON public.tax_calculations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own calculations"
ON public.tax_calculations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Accountants view client calculations"
ON public.tax_calculations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.accountant_client_links
  WHERE accountant_id = auth.uid()
    AND client_id = tax_calculations.user_id
    AND status = 'active'
));

CREATE TRIGGER trg_tax_calc_updated
BEFORE UPDATE ON public.tax_calculations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.declaration_drafts
  ADD COLUMN calculation_id UUID REFERENCES public.tax_calculations(id) ON DELETE SET NULL,
  ADD COLUMN period_year INTEGER,
  ADD COLUMN period_month INTEGER;

CREATE TRIGGER trg_decl_draft_updated
BEFORE UPDATE ON public.declaration_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
