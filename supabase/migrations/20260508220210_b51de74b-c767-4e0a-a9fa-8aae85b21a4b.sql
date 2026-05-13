-- 1. Versionado en tax_calculations
ALTER TABLE public.tax_calculations
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_tax_calc_period
  ON public.tax_calculations (user_id, period_year, period_month, is_current);

-- Trigger: nuevas inserciones marcan versiones previas como no-actuales
CREATE OR REPLACE FUNCTION public.tax_calc_version_bump()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_version INTEGER;
  prev_id UUID;
BEGIN
  SELECT version_number, id INTO prev_version, prev_id
  FROM public.tax_calculations
  WHERE user_id = NEW.user_id
    AND period_year = NEW.period_year
    AND period_month = NEW.period_month
    AND is_current = true
    AND id <> NEW.id
  ORDER BY version_number DESC
  LIMIT 1;

  IF prev_id IS NOT NULL THEN
    UPDATE public.tax_calculations
      SET is_current = false
      WHERE id = prev_id;
    NEW.version_number := COALESCE(prev_version, 0) + 1;
    NEW.supersedes_id := prev_id;
  END IF;
  NEW.is_current := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calc_version_bump ON public.tax_calculations;
CREATE TRIGGER trg_tax_calc_version_bump
  BEFORE INSERT ON public.tax_calculations
  FOR EACH ROW EXECUTE FUNCTION public.tax_calc_version_bump();

-- 2. Snapshots inmutables en declaration_drafts
ALTER TABLE public.declaration_drafts
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;

ALTER TABLE public.declaration_drafts
  DROP CONSTRAINT IF EXISTS declaration_drafts_status_check;
ALTER TABLE public.declaration_drafts
  ADD CONSTRAINT declaration_drafts_status_check
  CHECK (status IN ('draft','ready','finalized','exported_pdf','submitted'));

CREATE OR REPLACE FUNCTION public.declaration_draft_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('finalized','exported_pdf','submitted')
     AND NEW.status NOT IN ('finalized','exported_pdf','submitted') THEN
    RAISE EXCEPTION 'Cannot revert a finalized declaration to %', NEW.status;
  END IF;
  IF OLD.status IN ('finalized','exported_pdf','submitted') THEN
    -- congelar campos clave del snapshot
    NEW.calculation_id := OLD.calculation_id;
    NEW.period_year    := OLD.period_year;
    NEW.period_month   := OLD.period_month;
    NEW.form_data      := OLD.form_data;
    NEW.frozen_at      := COALESCE(OLD.frozen_at, NEW.frozen_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_declaration_draft_guard ON public.declaration_drafts;
CREATE TRIGGER trg_declaration_draft_guard
  BEFORE UPDATE ON public.declaration_drafts
  FOR EACH ROW EXECUTE FUNCTION public.declaration_draft_guard();

-- 3. Políticas de Storage para declaration-pdfs
DROP POLICY IF EXISTS "Users read own declaration pdfs" ON storage.objects;
CREATE POLICY "Users read own declaration pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'declaration-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users upload own declaration pdfs" ON storage.objects;
CREATE POLICY "Users upload own declaration pdfs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'declaration-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Accountants read client declaration pdfs" ON storage.objects;
CREATE POLICY "Accountants read client declaration pdfs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'declaration-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.accountant_client_links l
      WHERE l.accountant_id = auth.uid()
        AND l.client_id::text = (storage.foldername(name))[1]
        AND l.status = 'active'
    )
  );