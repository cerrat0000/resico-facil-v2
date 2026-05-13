ALTER FUNCTION public.tax_calc_version_bump() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.tax_calc_version_bump() FROM PUBLIC, anon, authenticated;