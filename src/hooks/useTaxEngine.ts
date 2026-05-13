import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TaxCalculation {
  id: string;
  user_id: string;
  period_year: number;
  period_month: number;
  total_income: number;
  total_expenses: number;
  taxable_base: number;
  estimated_tax: number;
  applied_rate: number;
  calculation_version: string;
  version_number: number;
  is_current: boolean;
  supersedes_id: string | null;
  notes: string | null;
  breakdown: any;
  created_at: string;
  updated_at: string;
}

export interface DeclarationDraft {
  id: string;
  user_id: string;
  status: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  frozen_at: string | null;
  form_data: any;
  calculation_id: string | null;
  period_year: number | null;
  period_month: number | null;
  created_at: string;
  updated_at: string;
}

export const useTaxCalculations = (opts: { onlyCurrent?: boolean } = {}) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tax_calculations', user?.id, opts.onlyCurrent ?? true],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('tax_calculations')
        .select('*')
        .eq('user_id', user!.id);
      if (opts.onlyCurrent ?? true) q = q.eq('is_current', true);
      const { data, error } = await q
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaxCalculation[];
    },
  });
};

export const usePeriodVersions = (year?: number, month?: number) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tax_calculations_versions', user?.id, year, month],
    enabled: !!user && !!year && !!month,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_calculations')
        .select('*')
        .eq('user_id', user!.id)
        .eq('period_year', year!)
        .eq('period_month', month!)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaxCalculation[];
    },
  });
};

export const useDeclarationDrafts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['declaration_drafts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('declaration_drafts')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeclarationDraft[];
    },
  });
};

export const useCalculateTaxPeriod = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      taxpayer_profile_id?: string | null;
      overrides?: { total_income?: number; total_expenses?: number; taxable_base?: number } | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('calculate-tax-period', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as TaxCalculation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax_calculations', user?.id] });
      qc.invalidateQueries({ queryKey: ['tax_calculations_versions', user?.id] });
    },
  });
};

export const useSaveDeclarationDraft = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      calculation_id: string;
      period_year: number;
      period_month: number;
      form_data: any;
      status?: string;
    }) => {
      if (!user) throw new Error('No user');
      // Buscar borrador existente por (user, calculation_id) — un cálculo congelado = un borrador
      const { data: existing } = await supabase
        .from('declaration_drafts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('calculation_id', input.calculation_id)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        calculation_id: input.calculation_id,
        period_year: input.period_year,
        period_month: input.period_month,
        form_data: input.form_data,
        status: input.status ?? 'draft',
      };

      if (existing?.id) {
        // No tocar borradores ya finalizados
        if (['finalized', 'exported_pdf', 'submitted'].includes(existing.status ?? '')) {
          return existing;
        }
        const { data, error } = await supabase
          .from('declaration_drafts')
          .update(payload)
          .eq('id', existing.id)
          .select('*').single();
        if (error) throw error;
        await supabase.from('audit_logs').insert({
          user_id: user.id, action: 'declaration_draft.update',
          table_name: 'declaration_drafts', record_id: data.id, new_data: payload,
        });
        return data;
      }
      const { data, error } = await supabase
        .from('declaration_drafts').insert(payload).select('*').single();
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action: 'declaration_draft.create',
        table_name: 'declaration_drafts', record_id: data.id, new_data: payload,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_drafts', user?.id] });
    },
  });
};

export const useFinalizeDraft = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const { data, error } = await supabase
        .from('declaration_drafts')
        .update({ status: 'finalized', frozen_at: new Date().toISOString() })
        .eq('id', draftId).select('*').single();
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id, action: 'declaration.finalize',
        table_name: 'declaration_drafts', record_id: draftId,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['declaration_drafts', user?.id] }),
  });
};

export const useGenerateDeclarationPdf = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { draft_id?: string; calculation_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-declaration-pdf', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { draft: DeclarationDraft; pdf_url: string; pdf_storage_path: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_drafts', user?.id] });
    },
  });
};

export const useRefreshPdfSignedUrl = () => {
  return useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage
        .from('declaration-pdfs').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) throw error;
      return data.signedUrl;
    },
  });
};
