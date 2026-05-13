import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['taxpayer_profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('taxpayer_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as TaxpayerProfile | null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<TaxpayerProfile>) => {
      if (!user) throw new Error('No user');
      const payload = { ...values, user_id: user.id };
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
      qc.invalidateQueries({ queryKey: ['taxpayer_profile', user?.id] });
    },
  });

  return { ...query, upsert };
};
