-- Active accountant/client links represent operational access in proxy mode.
-- Ensure existing and newly accepted links can create records and declarations.

UPDATE public.accountant_client_links
SET permissions = jsonb_build_object(
  'read', true,
  'edit', true,
  'documents', true
)
WHERE status = 'active'
  AND COALESCE((permissions->>'edit')::boolean, false) = false;

ALTER TABLE public.accountant_client_links
ALTER COLUMN permissions SET DEFAULT '{"read": true, "edit": true, "documents": true}'::jsonb;
