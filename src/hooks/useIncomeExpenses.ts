import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProxy } from '@/contexts/ProxyContext';
import { logAuditAction } from '@/lib/auditLogger';
import { toast } from 'sonner';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
  period_year: number;
  period_month: number;
}

export const useIncomeExpenses = () => {
  const { effectiveUserId, isProxyMode } = useProxy();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['income_expenses', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const [incomeRes, expenseRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('id, amount, category_name, description, date, period_year, period_month')
          .eq('user_id', effectiveUserId!)
          .eq('status', 'active')
          .order('date', { ascending: false }),
        supabase
          .from('expense_records')
          .select('id, amount, category_name, description, date, period_year, period_month')
          .eq('user_id', effectiveUserId!)
          .eq('status', 'active')
          .order('date', { ascending: false }),
      ]);

      if (incomeRes.error) throw incomeRes.error;
      if (expenseRes.error) throw expenseRes.error;

      const income: Transaction[] = (incomeRes.data ?? []).map((r) => ({
        id: r.id,
        type: 'income',
        amount: Number(r.amount),
        category: r.category_name ?? '',
        description: r.description ?? '',
        date: r.date,
        period_year: r.period_year,
        period_month: r.period_month,
      }));

      const expense: Transaction[] = (expenseRes.data ?? []).map((r) => ({
        id: r.id,
        type: 'expense',
        amount: Number(r.amount),
        category: r.category_name ?? '',
        description: r.description ?? '',
        date: r.date,
        period_year: r.period_year,
        period_month: r.period_month,
      }));

      return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date));
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any & { type: 'income' | 'expense' }) => {
      if (!effectiveUserId) throw new Error('No user context');
      
      const { type, ...data } = payload;
      const tableName = type === 'income' ? 'income_records' : 'expense_records';
      
      const { data: record, error } = await supabase
        .from(tableName)
        .insert({
          ...data,
          user_id: effectiveUserId,
        })
        .select()
        .single();

      if (error) throw error;

      // Audit log
      logAuditAction({
        action: `accountant.create_${type}`,
        tableName,
        recordId: record.id,
        newData: data,
        clientId: effectiveUserId,
        isProxyMode
      });

      return record;
    },
    onSuccess: () => {
      // Invalidate everything related to the client's financial context
      qc.invalidateQueries({ queryKey: ['income_expenses', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['dashboard_stats', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['audit_logs', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['tax_calculations', effectiveUserId] });
      toast.success('Registro guardado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: string, type: 'income' | 'expense' }) => {
      const tableName = input.type === 'income' ? 'income_records' : 'expense_records';
      const { error } = await supabase
        .from(tableName)
        .update({ status: 'deleted' })
        .eq('id', input.id)
        .eq('user_id', effectiveUserId!);
      
      if (error) throw error;
      
      logAuditAction({
        action: `accountant.delete_${input.type}`,
        tableName,
        recordId: input.id,
        clientId: effectiveUserId,
        isProxyMode
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income_expenses', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['dashboard_stats', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['audit_logs', effectiveUserId] });
      toast.success('Registro eliminado');
    },
    onError: (error: any) => {
      toast.error(`Error al eliminar: ${error.message}`);
    }
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    addTransaction: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    deleteTransaction: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
};
