import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'taxpayer' | 'accountant' | 'admin';

export const useUserRole = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user_role', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      const roles = (data ?? []).map((r) => r.role as AppRole);
      // Priority: admin > accountant > taxpayer
      if (roles.includes('admin')) return 'admin' as AppRole;
      if (roles.includes('accountant')) return 'accountant' as AppRole;
      return 'taxpayer' as AppRole;
    },
  });
};
