import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProxy } from '@/contexts/ProxyContext';

export const useDashboardStats = () => {
  const { effectiveUserId } = useProxy();

  return useQuery({
    queryKey: ['dashboard_stats', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [incomeRes, expenseRes, docsRes, declRes, profileRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('amount')
          .eq('user_id', effectiveUserId!)
          .eq('status', 'active')
          .eq('period_year', year)
          .eq('period_month', month),
        supabase
          .from('expense_records')
          .select('amount')
          .eq('user_id', effectiveUserId!)
          .eq('status', 'active')
          .eq('period_year', year)
          .eq('period_month', month),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', effectiveUserId!)
          .eq('status', 'active'),
        supabase
          .from('declaration_drafts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', effectiveUserId!)
          .neq('status', 'submitted'),
        supabase
          .from('taxpayer_profiles')
          .select('rfc, curp, fiscal_address, economic_activity')
          .eq('user_id', effectiveUserId!)
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

      // Estimación básica de ISR RESICO (0.01 - 0.025 dependiendo del monto mensual)
      // Nota: Esto es solo una estimación visual para el dashboard
      let estimatedIsr = 0;
      if (monthIncome > 0) {
        const rate = monthIncome <= 25000 ? 0.01 : monthIncome <= 50000 ? 0.011 : monthIncome <= 83333 ? 0.015 : monthIncome <= 208333 ? 0.02 : 0.025;
        estimatedIsr = monthIncome * rate;
      }

      // Obtener último movimiento
      const { data: lastMove } = await supabase
        .from('income_records')
        .select('amount, category_name, date, description')
        .eq('user_id', effectiveUserId!)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        monthIncome,
        monthExpenses,
        docsCount,
        pendingDeclarations,
        profileCompletion,
        hasProfile: !!p && profileCompletion === 100,
        estimatedIsr,
        lastMovement: lastMove ? {
          amount: Number(lastMove.amount),
          category: lastMove.category_name,
          date: lastMove.date,
          description: lastMove.description
        } : null
      };
    },
  });
};
