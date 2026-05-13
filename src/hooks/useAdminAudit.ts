import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useAdminAudit = (filters: {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ['admin_audit_logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.action) {
        query = query.eq('action', filters.action);
      }
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    }
  });
};

export const useAdminAuditStats = () => {
  return useQuery({
    queryKey: ['admin_audit_stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: actionsToday } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      const { count: pdfsGenerated } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'accountant.generate_pdf');

      const { count: declarationsFinalized } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'accountant.declaration.finalize');

      return {
        actionsToday: actionsToday || 0,
        pdfsGenerated: pdfsGenerated || 0,
        declarationsFinalized: declarationsFinalized || 0,
      };
    }
  });
};
