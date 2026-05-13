-- Migration: 20260513105500_profile_visibility_hardening.sql
-- Allow accountants and clients to see each other's basic profile info (names)

-- 1. Allow accountants to see profiles of their clients
DROP POLICY IF EXISTS "Accountants view client profiles" ON public.profiles;
CREATE POLICY "Accountants view client profiles" ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.accountant_id = auth.uid() 
      AND acl.client_id = profiles.user_id 
      AND acl.status = 'active'
  )
);

-- 2. Allow clients to see profiles of their accountants
DROP POLICY IF EXISTS "Clients view accountant profiles" ON public.profiles;
CREATE POLICY "Clients view accountant profiles" ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links acl
    WHERE acl.client_id = auth.uid() 
      AND acl.accountant_id = profiles.user_id 
      AND acl.status = 'active'
  )
);
