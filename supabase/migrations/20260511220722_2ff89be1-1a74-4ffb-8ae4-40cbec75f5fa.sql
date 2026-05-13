
-- Financial scores
CREATE TABLE public.financial_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  estimated_capacity NUMERIC NOT NULL DEFAULT 0,
  monthly_avg_income NUMERIC NOT NULL DEFAULT 0,
  monthly_avg_expense NUMERIC NOT NULL DEFAULT 0,
  active_months INTEGER NOT NULL DEFAULT 0,
  declarations_count INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_scores_user ON public.financial_scores(user_id, computed_at DESC);
ALTER TABLE public.financial_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scores" ON public.financial_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scores" ON public.financial_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Accountants view client scores" ON public.financial_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM accountant_client_links WHERE accountant_id = auth.uid() AND client_id = financial_scores.user_id AND status = 'active')
);

-- Financial applications
CREATE TABLE public.financial_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  folio TEXT NOT NULL UNIQUE DEFAULT ('AF-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  requested_amount NUMERIC NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_rate NUMERIC NOT NULL DEFAULT 0.032,
  cat_estimate NUMERIC NOT NULL DEFAULT 0.35,
  estimated_monthly_payment NUMERIC NOT NULL DEFAULT 0,
  estimated_total_payment NUMERIC NOT NULL DEFAULT 0,
  approved_amount NUMERIC,
  approved_term_months INTEGER,
  approved_monthly_payment NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_review',
  score_snapshot INTEGER,
  risk_snapshot TEXT,
  pdf_path TEXT,
  pdf_generated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_applications_user ON public.financial_applications(user_id, created_at DESC);
ALTER TABLE public.financial_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own applications" ON public.financial_applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own applications" ON public.financial_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own applications" ON public.financial_applications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Accountants view client applications" ON public.financial_applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM accountant_client_links WHERE accountant_id = auth.uid() AND client_id = financial_applications.user_id AND status = 'active')
);

CREATE TRIGGER update_financial_applications_updated_at
  BEFORE UPDATE ON public.financial_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Financial documents
CREATE TABLE public.financial_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  application_id UUID,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own fin docs" ON public.financial_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own fin docs" ON public.financial_documents FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('financial-docs', 'financial-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own financial files"
ON storage.objects FOR SELECT
USING (bucket_id = 'financial-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own financial files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'financial-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket for approval letters
INSERT INTO storage.buckets (id, name, public) VALUES ('financial-approvals', 'financial-approvals', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own approval letters"
ON storage.objects FOR SELECT
USING (bucket_id = 'financial-approvals' AND auth.uid()::text = (storage.foldername(name))[1]);
