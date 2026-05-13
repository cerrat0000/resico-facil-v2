-- Migration: 20260513103000_fix_accountant_rls_status.sql
-- Fix RLS and Status constraints for Accountant Proxy Mode

-- 1. Update accountant_client_links status constraint
ALTER TABLE public.accountant_client_links 
DROP CONSTRAINT IF EXISTS accountant_client_links_status_check;

ALTER TABLE public.accountant_client_links 
ADD CONSTRAINT accountant_client_links_status_check 
CHECK (status IN ('active', 'revoked', 'pending', 'read_only', 'rejected'));

-- 2. RE-HARDENING INCOME RECORDS (Fixing potential ambiguity and permissions)
DROP POLICY IF EXISTS "Accountants insert client income" ON public.income_records;
CREATE POLICY "Accountants insert client income" ON public.income_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id -- user_id refers to the inserted row
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client income" ON public.income_records;
CREATE POLICY "Accountants update client income" ON public.income_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

-- 3. RE-HARDENING EXPENSE RECORDS
DROP POLICY IF EXISTS "Accountants insert client expenses" ON public.expense_records;
CREATE POLICY "Accountants insert client expenses" ON public.expense_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client expenses" ON public.expense_records;
CREATE POLICY "Accountants update client expenses" ON public.expense_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

-- 4. RE-HARDENING DOCUMENTS
DROP POLICY IF EXISTS "Accountants insert client documents" ON public.documents;
CREATE POLICY "Accountants insert client documents" ON public.documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

-- 5. RE-HARDENING DECLARATION DRAFTS
DROP POLICY IF EXISTS "Accountants insert client declarations" ON public.declaration_drafts;
CREATE POLICY "Accountants insert client declarations" ON public.declaration_drafts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);

DROP POLICY IF EXISTS "Accountants update client declarations" ON public.declaration_drafts;
CREATE POLICY "Accountants update client declarations" ON public.declaration_drafts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = user_id 
      AND acl.status = 'active'
      AND (acl.permissions->>'edit')::boolean = true
  )
);
