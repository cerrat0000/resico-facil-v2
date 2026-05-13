import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getStripeEnvironment } from '@/lib/stripe';

export const useCreateDeclarationPayment = () => {
  return useMutation({
    mutationFn: async (input: { declarationId: string; returnUrl: string }) => {
      const { data, error } = await supabase.functions.invoke('create-declaration-payment', {
        body: {
          declarationId: input.declarationId,
          returnUrl: input.returnUrl,
          environment: getStripeEnvironment(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { clientSecret: string };
    },
  });
};

export const useGenerateCfdiDemo = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (declarationId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-cfdi-demo', {
        body: { declarationId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { url: string; path: string; folio: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['declaration_drafts', user?.id] }),
  });
};

export const useRefreshCfdiSignedUrl = () => {
  return useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage
        .from('cfdi-demos').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) throw error;
      return data.signedUrl;
    },
  });
};

export const useAdminMetrics = () => {
  return useQuery({
    queryKey: ['admin_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-metrics');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as {
        totalUsers: number; activeUsers: number;
        totalDeclarations: number; paidDeclarations: number;
        openTickets: number; accountantUsers: number; revenue: number;
      };
    },
  });
};
