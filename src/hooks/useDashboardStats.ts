import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useDashboardStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard_stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [incomeRes, expenseRes, docsRes, declRes, profileRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('amount')
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .eq('period_year', year)
          .eq('period_month', month),
        supabase
          .from('expense_records')
          .select('amount')
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .eq('period_year', year)
          .eq('period_month', month),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('status', 'active'),
        supabase
          .from('declaration_drafts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .neq('status', 'submitted'),
        supabase
          .from('taxpayer_profiles')
          .select('rfc, curp, fiscal_address, economic_activity')
          .eq('user_id', user!.id)
          .maybeSingle(),
      ]);

      const monthIncome = (incomeRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const monthExpenses = (expenseRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const docsCount = docsRes.count ?? 0;
      const pendingDeclarations = declRes.count ?? 0;

      const p = profileRes.data;
      const profileFields = ['rfc', 'curp', 'fiscal_address', 'economic_activity'] as const;
      const completed = p
        ? profileFields.filter((f) => !!(p as any)[f]).length
        : 0;
      const profileCompletion = Math.round((completed / profileFields.length) * 100);

      return {
        monthIncome,
        monthExpenses,
        docsCount,
        pendingDeclarations,
        profileCompletion,
        hasProfile: !!p && profileCompletion === 100,
      };
    },
  });
};
