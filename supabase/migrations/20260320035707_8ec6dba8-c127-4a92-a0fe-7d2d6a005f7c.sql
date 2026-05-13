
-- Fix: Replace overly permissive audit_logs INSERT policy
DROP POLICY "System inserts audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
