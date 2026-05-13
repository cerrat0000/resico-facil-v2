import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProxy } from '@/contexts/ProxyContext';
import { logAuditAction } from '@/lib/auditLogger';

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
  const { effectiveUserId } = useProxy();
  return useQuery({
    queryKey: ['tax_calculations', effectiveUserId, opts.onlyCurrent ?? true],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      let q = supabase
        .from('tax_calculations')
        .select('*')
        .eq('user_id', effectiveUserId!);
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
  const { effectiveUserId } = useProxy();
  return useQuery({
    queryKey: ['tax_calculations_versions', effectiveUserId, year, month],
    enabled: !!effectiveUserId && !!year && !!month,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_calculations')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .eq('period_year', year!)
        .eq('period_month', month!)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaxCalculation[];
    },
  });
};

export const useDeclarationDrafts = () => {
  const { effectiveUserId } = useProxy();
  return useQuery({
    queryKey: ['declaration_drafts', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('declaration_drafts')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeclarationDraft[];
    },
  });
};

export const useCalculateTaxPeriod = () => {
  const { effectiveUserId } = useProxy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number;
      taxpayer_profile_id?: string | null;
      overrides?: { total_income?: number; total_expenses?: number; taxable_base?: number } | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('calculate-tax-period', {
        body: { ...input, target_user_id: effectiveUserId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as TaxCalculation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tax_calculations', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['tax_calculations_versions', effectiveUserId] });
      qc.invalidateQueries({ queryKey: ['dashboard_stats', effectiveUserId] });
      
      if (effectiveUserId) {
        logAuditAction({
          action: 'accountant.calculate_tax',
          tableName: 'tax_calculations',
          recordId: data.id,
          newData: data,
          clientId: effectiveUserId
        });
      }
    },
  });
};

export const useSaveDeclarationDraft = () => {
  const { user } = useAuth();
  const { effectiveUserId } = useProxy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      calculation_id: string;
      period_year: number;
      period_month: number;
      form_data: any;
      status?: string;
    }) => {
      if (!user || !effectiveUserId) throw new Error('No user');
      // Buscar borrador existente por (user, calculation_id) — un cálculo congelado = un borrador
      const { data: existing } = await supabase
        .from('declaration_drafts')
        .select('id, status')
        .eq('user_id', effectiveUserId)
        .eq('calculation_id', input.calculation_id)
        .maybeSingle();

      const payload = {
        user_id: effectiveUserId,
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
        
        logAuditAction({
          action: 'accountant.declaration_draft.update',
          tableName: 'declaration_drafts',
          recordId: data.id,
          newData: payload,
          clientId: effectiveUserId
        });
        
        return data;
      }
      const { data, error } = await supabase
        .from('declaration_drafts').insert(payload).select('*').single();
      if (error) throw error;

      logAuditAction({
        action: 'accountant.declaration_draft.create',
        tableName: 'declaration_drafts',
        recordId: data.id,
        newData: payload,
        clientId: effectiveUserId
      });
      
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_drafts', effectiveUserId] });
    },
  });
};

export const useFinalizeDraft = () => {
  const { user } = useAuth();
  const { effectiveUserId } = useProxy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const { data, error } = await supabase
        .from('declaration_drafts')
        .update({ status: 'finalized', frozen_at: new Date().toISOString() })
        .eq('id', draftId).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['declaration_drafts', effectiveUserId] });
      
      logAuditAction({
        action: 'accountant.declaration.finalize',
        tableName: 'declaration_drafts',
        recordId: data.id,
        clientId: effectiveUserId
      });
    },
  });
};

export const useGenerateDeclarationPdf = () => {
  const { effectiveUserId } = useProxy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { draft_id?: string; calculation_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-declaration-pdf', {
        body: { ...input, target_user_id: effectiveUserId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { draft: DeclarationDraft; pdf_url: string; pdf_storage_path: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_drafts', effectiveUserId] });
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
