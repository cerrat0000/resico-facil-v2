
-- Fase 1: Pagos de declaraciones
ALTER TABLE public.declaration_drafts
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_amount numeric,
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS cfdi_demo_path text,
  ADD COLUMN IF NOT EXISTS cfdi_demo_folio text,
  ADD COLUMN IF NOT EXISTS cfdi_generated_at timestamptz;

-- Indexar por session_id para webhook lookup
CREATE INDEX IF NOT EXISTS idx_declaration_drafts_stripe_session
  ON public.declaration_drafts(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Vincular payment_transactions a declaraciones
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS declaration_id uuid,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- Bucket para CFDI demos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cfdi-demos', 'cfdi-demos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS storage para CFDI demos: usuario solo ve los suyos
DROP POLICY IF EXISTS "Users view own cfdi demos" ON storage.objects;
CREATE POLICY "Users view own cfdi demos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cfdi-demos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Service role manages cfdi demos" ON storage.objects;
CREATE POLICY "Service role manages cfdi demos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'cfdi-demos' AND auth.role() = 'service_role');

-- Helper: marcar declaración como lista para pagar cuando hay ISR > 0
-- (Lógica en el front por ahora; este check guarda integridad)
ALTER TABLE public.declaration_drafts
  DROP CONSTRAINT IF EXISTS declaration_drafts_payment_status_check;
ALTER TABLE public.declaration_drafts
  ADD CONSTRAINT declaration_drafts_payment_status_check
  CHECK (payment_status IN ('pending','ready_to_pay','paid','under_review'));
