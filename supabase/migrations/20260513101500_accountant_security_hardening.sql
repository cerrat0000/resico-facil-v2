-- Migration: 20260513101500_accountant_security_hardening.sql
-- Hardening RLS for Accountant Proxy Mode

-- 1. INCOME RECORDS
DROP POLICY IF EXISTS "Accountants insert client income" ON public.income_records;
CREATE POLICY "Accountants insert client income" ON public.income_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = income_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client income" ON public.income_records;
CREATE POLICY "Accountants update client income" ON public.income_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = income_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants delete client income" ON public.income_records;
CREATE POLICY "Accountants delete client income" ON public.income_records FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = income_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

-- 2. EXPENSE RECORDS
DROP POLICY IF EXISTS "Accountants insert client expenses" ON public.expense_records;
CREATE POLICY "Accountants insert client expenses" ON public.expense_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = expense_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client expenses" ON public.expense_records;
CREATE POLICY "Accountants update client expenses" ON public.expense_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = expense_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants delete client expenses" ON public.expense_records;
CREATE POLICY "Accountants delete client expenses" ON public.expense_records FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = expense_records.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

-- 3. DOCUMENTS
DROP POLICY IF EXISTS "Accountants insert client documents" ON public.documents;
CREATE POLICY "Accountants insert client documents" ON public.documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = documents.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client documents" ON public.documents;
CREATE POLICY "Accountants update client documents" ON public.documents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = documents.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

-- 4. DECLARATION DRAFTS
DROP POLICY IF EXISTS "Accountants insert client declarations" ON public.declaration_drafts;
CREATE POLICY "Accountants insert client declarations" ON public.declaration_drafts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = declaration_drafts.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client declarations" ON public.declaration_drafts;
CREATE POLICY "Accountants update client declarations" ON public.declaration_drafts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = declaration_drafts.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

-- 5. TAX PERIODS
DROP POLICY IF EXISTS "Accountants update client tax periods" ON public.tax_periods;
CREATE POLICY "Accountants update client tax periods" ON public.tax_periods FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id = tax_periods.user_id 
      AND status = 'active'
      AND (permissions->>'edit')::boolean = true
  )
);

-- 6. AUDIT LOGS FOR ACCOUNTANT ACTIONS
-- Ensure accountants can view client audit logs
DROP POLICY IF EXISTS "Accountants view client audit logs" ON public.audit_logs;
CREATE POLICY "Accountants view client audit logs" ON public.audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid() 
      AND client_id::text = (audit_logs.new_data->'_metadata'->>'target_user_id')
      AND status = 'active'
  )
);
