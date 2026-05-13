
-- =============================================
-- RESICO FÁCIL - DATABASE SCHEMA
-- =============================================

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('taxpayer', 'accountant', 'admin', 'supervisor');

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- 1. PROFILES & IDENTITY
-- =============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'taxpayer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profile auto-creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'taxpayer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. TAXPAYER PROFILE
-- =============================================

CREATE TABLE public.taxpayer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  rfc VARCHAR(13),
  curp VARCHAR(18),
  fiscal_address TEXT,
  economic_activity TEXT,
  tax_regime TEXT DEFAULT 'RESICO',
  fiscal_status TEXT DEFAULT 'active',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.taxpayer_profiles ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_taxpayer_rfc ON public.taxpayer_profiles(rfc) WHERE rfc IS NOT NULL;
CREATE INDEX idx_taxpayer_user ON public.taxpayer_profiles(user_id);

-- =============================================
-- 3. INCOME & EXPENSES
-- =============================================

CREATE TABLE public.transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.income_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  taxpayer_profile_id UUID REFERENCES public.taxpayer_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES public.transaction_categories(id),
  category_name TEXT,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
  attachment_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_income_user ON public.income_records(user_id);
CREATE INDEX idx_income_period ON public.income_records(user_id, period_year, period_month);
CREATE INDEX idx_income_date ON public.income_records(date);

CREATE TABLE public.expense_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  taxpayer_profile_id UUID REFERENCES public.taxpayer_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES public.transaction_categories(id),
  category_name TEXT,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  period_month INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
  attachment_url TEXT,
  is_deductible BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_expense_user ON public.expense_records(user_id);
CREATE INDEX idx_expense_period ON public.expense_records(user_id, period_year, period_month);

-- =============================================
-- 4. DOCUMENTS & DIGITAL FILES
-- =============================================

CREATE TABLE public.document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_type_id UUID REFERENCES public.document_types(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ocr_raw JSONB,
  ocr_extracted JSONB,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_documents_user ON public.documents(user_id);
CREATE INDEX idx_documents_type ON public.documents(document_type_id);

-- =============================================
-- 5. DECLARATIONS
-- =============================================

CREATE TABLE public.tax_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  total_income NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  estimated_tax NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'calculated', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);
ALTER TABLE public.tax_periods ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tax_periods_user ON public.tax_periods(user_id, period_year, period_month);

CREATE TABLE public.declaration_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tax_period_id UUID REFERENCES public.tax_periods(id) ON DELETE CASCADE,
  form_data JSONB,
  pdf_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.declaration_drafts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. ACCOUNTANT LINKS
-- =============================================

CREATE TABLE public.accountant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  license_number TEXT,
  specialization TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accountant_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.accountant_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permissions JSONB DEFAULT '{"read": true, "edit": false, "documents": true}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(accountant_id, client_id)
);
ALTER TABLE public.accountant_client_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_acl_accountant ON public.accountant_client_links(accountant_id);
CREATE INDEX idx_acl_client ON public.accountant_client_links(client_id);

CREATE TABLE public.accountant_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accountant_notes ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 7. SUBSCRIPTIONS & PAYMENTS
-- =============================================

CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  interval TEXT DEFAULT 'monthly',
  features JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.subscription_plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  is_subsidized BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_subs ON public.user_subscriptions(user_id);

CREATE TABLE public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  provider_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 8. TUTORIALS & SUPPORT
-- =============================================

CREATE TABLE public.tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  duration_minutes INTEGER,
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tutorial_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tutorial_id UUID REFERENCES public.tutorials(id) ON DELETE CASCADE NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tutorial_id)
);
ALTER TABLE public.tutorial_progress ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 9. SUPPORT PROGRAMS & CREDITS
-- =============================================

CREATE TABLE public.support_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  program_type TEXT CHECK (program_type IN ('credit', 'grant', 'subsidy')),
  max_amount NUMERIC(12,2),
  description TEXT,
  requirements JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_programs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.support_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  program_id UUID REFERENCES public.support_programs(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'interested' CHECK (status IN ('interested', 'applied', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_applications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 10. SYNC QUEUE (OFFLINE)
-- =============================================

CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- =============================================
-- TRIGGERS FOR updated_at
-- =============================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_taxpayer_profiles_updated_at BEFORE UPDATE ON public.taxpayer_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_income_records_updated_at BEFORE UPDATE ON public.income_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expense_records_updated_at BEFORE UPDATE ON public.expense_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tax_periods_updated_at BEFORE UPDATE ON public.tax_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_declaration_drafts_updated_at BEFORE UPDATE ON public.declaration_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_accountant_profiles_updated_at BEFORE UPDATE ON public.accountant_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_accountant_client_links_updated_at BEFORE UPDATE ON public.accountant_client_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_support_applications_updated_at BEFORE UPDATE ON public.support_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles: users see/edit only their own
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles: users see own roles, admins see all
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Audit logs: only admins via server-side
CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Taxpayer profiles
CREATE POLICY "Users view own taxpayer profile" ON public.taxpayer_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own taxpayer profile" ON public.taxpayer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own taxpayer profile" ON public.taxpayer_profiles FOR UPDATE USING (auth.uid() = user_id);
-- Accountant can view assigned client taxpayer profiles
CREATE POLICY "Accountants view client taxpayer profiles" ON public.taxpayer_profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() AND client_id = taxpayer_profiles.user_id AND status = 'active'
  ));

-- Income records
CREATE POLICY "Users view own income" ON public.income_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own income" ON public.income_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own income" ON public.income_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own income" ON public.income_records FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Accountants view client income" ON public.income_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() AND client_id = income_records.user_id AND status = 'active'
  ));

-- Expense records
CREATE POLICY "Users view own expenses" ON public.expense_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own expenses" ON public.expense_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own expenses" ON public.expense_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own expenses" ON public.expense_records FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Accountants view client expenses" ON public.expense_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() AND client_id = expense_records.user_id AND status = 'active'
  ));

-- Document types: public read
CREATE POLICY "Anyone can view document types" ON public.document_types FOR SELECT USING (true);

-- Documents
CREATE POLICY "Users view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Accountants view client documents" ON public.documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() AND client_id = documents.user_id AND status = 'active'
  ));

-- Tax periods
CREATE POLICY "Users view own tax periods" ON public.tax_periods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tax periods" ON public.tax_periods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tax periods" ON public.tax_periods FOR UPDATE USING (auth.uid() = user_id);

-- Declaration drafts
CREATE POLICY "Users view own declarations" ON public.declaration_drafts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own declarations" ON public.declaration_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own declarations" ON public.declaration_drafts FOR UPDATE USING (auth.uid() = user_id);

-- Accountant profiles
CREATE POLICY "Accountants view own profile" ON public.accountant_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Accountants update own profile" ON public.accountant_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Accountants insert own profile" ON public.accountant_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Accountant client links
CREATE POLICY "Accountants view own links" ON public.accountant_client_links FOR SELECT USING (auth.uid() = accountant_id);
CREATE POLICY "Clients view own links" ON public.accountant_client_links FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Accountants insert links" ON public.accountant_client_links FOR INSERT WITH CHECK (auth.uid() = accountant_id);
CREATE POLICY "Accountants update links" ON public.accountant_client_links FOR UPDATE USING (auth.uid() = accountant_id);

-- Accountant notes
CREATE POLICY "Accountants manage own notes" ON public.accountant_notes FOR ALL USING (auth.uid() = accountant_id);
CREATE POLICY "Clients view notes about them" ON public.accountant_notes FOR SELECT USING (auth.uid() = client_id);

-- Subscription plans: public read
CREATE POLICY "Anyone can view plans" ON public.subscription_plans FOR SELECT USING (true);

-- User subscriptions
CREATE POLICY "Users view own subscriptions" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subscriptions" ON public.user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Payment transactions
CREATE POLICY "Users view own payments" ON public.payment_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own payments" ON public.payment_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tutorials: public read
CREATE POLICY "Anyone can view tutorials" ON public.tutorials FOR SELECT USING (is_published = true);
CREATE POLICY "Admins manage tutorials" ON public.tutorials FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Tutorial progress
CREATE POLICY "Users manage own progress" ON public.tutorial_progress FOR ALL USING (auth.uid() = user_id);

-- Support tickets
CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins view all tickets" ON public.support_tickets FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Support programs: public read
CREATE POLICY "Anyone can view programs" ON public.support_programs FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage programs" ON public.support_programs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Support applications
CREATE POLICY "Users manage own applications" ON public.support_applications FOR ALL USING (auth.uid() = user_id);

-- Sync queue
CREATE POLICY "Users manage own sync queue" ON public.sync_queue FOR ALL USING (auth.uid() = user_id);

-- Transaction categories: public read
CREATE POLICY "Anyone can view categories" ON public.transaction_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.transaction_categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- STORAGE BUCKETS
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('taxpayer-documents', 'taxpayer-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('tickets-expenses', 'tickets-expenses', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('identity-documents', 'identity-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('declaration-pdfs', 'declaration-pdfs', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('support-files', 'support-files', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('tutorial-assets', 'tutorial-assets', true);

-- Storage policies
CREATE POLICY "Users upload own taxpayer docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'taxpayer-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own taxpayer docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'taxpayer-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own tickets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tickets-expenses' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own tickets" ON storage.objects FOR SELECT
  USING (bucket_id = 'tickets-expenses' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own identity docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'identity-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own identity docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'identity-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own declaration pdfs" ON storage.objects FOR SELECT
  USING (bucket_id = 'declaration-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone view tutorial assets" ON storage.objects FOR SELECT
  USING (bucket_id = 'tutorial-assets');
CREATE POLICY "Accountants view client taxpayer docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'taxpayer-documents' AND EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() AND client_id::text = (storage.foldername(name))[1] AND status = 'active'
  ));

-- =============================================
-- SEED DATA: Categories & Document Types
-- =============================================

INSERT INTO public.transaction_categories (name, type, is_default) VALUES
  ('Ventas', 'income', true),
  ('Servicios', 'income', true),
  ('Comisiones', 'income', true),
  ('Otros ingresos', 'income', true),
  ('Materia prima', 'expense', true),
  ('Renta', 'expense', true),
  ('Servicios', 'expense', true),
  ('Transporte', 'expense', true),
  ('Comida', 'expense', true),
  ('Papelería', 'expense', true),
  ('Otros gastos', 'expense', true);

INSERT INTO public.document_types (name, code, is_required) VALUES
  ('INE / Identificación oficial', 'ine', true),
  ('Constancia de Situación Fiscal', 'csf', true),
  ('Comprobante de domicilio', 'comprobante-domicilio', true),
  ('Estado de cuenta bancario', 'estado-cuenta', true),
  ('Ticket de compra', 'ticket', false),
  ('Factura', 'factura', false),
  ('Contrato', 'contrato', false),
  ('Otro documento', 'otro', false);

INSERT INTO public.subscription_plans (name, price, features) VALUES
  ('Gratuito', 0, '{"income_limit": 5, "expense_limit": 5, "declarations": 1}'::jsonb),
  ('Básico', 149, '{"income_limit": -1, "expense_limit": -1, "declarations": -1, "support": "chat"}'::jsonb),
  ('Profesional', 299, '{"income_limit": -1, "expense_limit": -1, "declarations": -1, "support": "priority", "accountant": true, "ocr": "advanced"}'::jsonb);

INSERT INTO public.tutorials (title, description, duration_minutes, order_index) VALUES
  ('¿Qué es RESICO?', 'Conoce el régimen simplificado de confianza', 5, 1),
  ('Cómo registrar tus ventas', 'Paso a paso para llevar tu registro diario', 3, 2),
  ('Tu expediente fiscal', 'Qué documentos necesitas y cómo organizarlos', 4, 3),
  ('Cómo presentar tu declaración', 'Guía simplificada del proceso mensual', 6, 4),
  ('Finanzas personales básicas', 'Separa lo personal de lo del negocio', 5, 5),
  ('Beneficios de estar al día', 'Accede a créditos y apoyos', 4, 6);

INSERT INTO public.support_programs (name, institution, program_type, max_amount, is_active) VALUES
  ('Crédito PyME Digital', 'Nacional Financiera', 'credit', 500000, true),
  ('Apoyo a Micronegocios', 'Secretaría de Economía', 'grant', 25000, true),
  ('Financiamiento Verde', 'FIRA', 'credit', 300000, true);
