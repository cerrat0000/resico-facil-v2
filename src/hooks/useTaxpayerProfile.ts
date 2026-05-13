import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProxy } from '@/contexts/ProxyContext';

export interface TaxpayerProfile {
  id?: string;
  user_id: string;
  rfc?: string | null;
  curp?: string | null;
  fiscal_address?: string | null;
  economic_activity?: string | null;
  tax_regime?: string | null;
  fiscal_status?: string | null;
  onboarding_completed?: boolean | null;
}

export const useTaxpayerProfile = () => {
  const { effectiveUserId, isProxyMode } = useProxy();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['taxpayer_profile', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('taxpayer_profiles')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .maybeSingle();
      if (error) throw error;
      return data as TaxpayerProfile | null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<TaxpayerProfile>) => {
      if (!effectiveUserId) throw new Error('No user');
      if (isProxyMode) {
        throw new Error('Los contadores no pueden modificar la información fiscal básica del cliente (RFC/CURP).');
      }
      const payload = { ...values, user_id: effectiveUserId };
      const existing = query.data;
      if (existing?.id) {
        const { error } = await supabase
          .from('taxpayer_profiles')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('taxpayer_profiles').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxpayer_profile', effectiveUserId] });
    },
  });

  return { ...query, upsert };
};
