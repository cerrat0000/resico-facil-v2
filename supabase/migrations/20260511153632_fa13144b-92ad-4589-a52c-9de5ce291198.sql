
-- 1. Update handle_new_user to support role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'taxpayer'::app_role);

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;

  IF _role = 'accountant'::app_role THEN
    INSERT INTO public.accountant_profiles (user_id, license_number, specialization)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'license_number',
      NEW.raw_user_meta_data->>'specialization'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Allow clients to update their own accountant_client_links (accept/reject)
DROP POLICY IF EXISTS "Clients update own links" ON public.accountant_client_links;
CREATE POLICY "Clients update own links"
ON public.accountant_client_links
FOR UPDATE
USING (auth.uid() = client_id);

-- 3. Unique constraint to prevent duplicate invitations
CREATE UNIQUE INDEX IF NOT EXISTS accountant_client_links_unique
ON public.accountant_client_links (accountant_id, client_id);

-- 4. Allow accountants to view declaration_drafts of linked clients
DROP POLICY IF EXISTS "Accountants view client declarations" ON public.declaration_drafts;
CREATE POLICY "Accountants view client declarations"
ON public.declaration_drafts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid()
      AND client_id = declaration_drafts.user_id
      AND status = 'active'
  )
);

-- 5. Allow authenticated users (clients) to see verified accountant profiles for invitation lookup
DROP POLICY IF EXISTS "Authenticated view verified accountants" ON public.accountant_profiles;
CREATE POLICY "Authenticated view verified accountants"
ON public.accountant_profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 6. Allow accountants to view profile basics of their linked clients
DROP POLICY IF EXISTS "Accountants view linked client profiles" ON public.profiles;
CREATE POLICY "Accountants view linked client profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accountant_client_links
    WHERE accountant_id = auth.uid()
      AND client_id = profiles.user_id
      AND status = 'active'
  )
);
