import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProxy } from '@/contexts/ProxyContext';

export const useProfile = () => {
  const { effectiveUserId, isProxyMode } = useProxy();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['profile', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (values: { full_name?: string; phone?: string }) => {
      if (!effectiveUserId) throw new Error('No user');
      if (isProxyMode) {
        throw new Error('Los contadores no pueden modificar el perfil personal del cliente.');
      }
      const { error } = await supabase
        .from('profiles')
        .update(values)
        .eq('user_id', effectiveUserId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', effectiveUserId] }),
  });

  return { ...query, update };
};
