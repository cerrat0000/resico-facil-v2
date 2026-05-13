import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProxy } from '@/contexts/ProxyContext';

export interface AuditLogEntry {
  id: string;
  action: string;
  tableName: string | null;
  recordId: string | null;
  createdAt: string;
  actorId: string | null;
  actorName?: string;
  actorRole?: string;
  isProxy: boolean;
  friendlyMessage: string;
  details?: any;
}

const ACTION_MAP: Record<string, string> = {
  'accountant.create_income': 'registró un nuevo ingreso',
  'accountant.create_expense': 'registró un nuevo gasto',
  'accountant.delete_income': 'eliminó un ingreso',
  'accountant.delete_expense': 'eliminó un gasto',
  'accountant.calculate_tax': 'realizó el cálculo de impuestos',
  'accountant.declaration_draft.update': 'actualizó un borrador de declaración',
  'accountant.declaration_draft.create': 'creó un nuevo borrador de declaración',
  'accountant.declaration.finalize': 'finalizó una declaración fiscal',
  'accountant.generate_pdf': 'generó un archivo PDF fiscal',
  'accountant.document_upload': 'subió un documento fiscal',
  'contador.access_revoked': 'revocó el acceso al despacho contable',
  'contador.permission_changed': 'cambió los permisos del contador',
};

export const useAuditLogs = () => {
  const { user } = useAuth();
  const { effectiveUserId } = useProxy();
  const targetId = effectiveUserId || user?.id;

  return useQuery({
    queryKey: ['audit_logs', targetId],
    enabled: !!targetId,
    queryFn: async () => {
      // Query logs where this user is the target (using JSONB path filter)
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .contains('new_data', { _metadata: { target_user_id: targetId } })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const filtered = data || [];

      // Get unique actor IDs to fetch names
      const actorIds = [...new Set(filtered.map(l => l.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', actorIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]));

      return filtered.map(log => {
        const meta = (log.new_data as any)?._metadata;
        const actorName = profileMap.get(log.user_id!) || 'Sistema';
        
        return {
          id: log.id,
          action: log.action,
          tableName: log.table_name,
          recordId: log.record_id,
          createdAt: log.created_at,
          actorId: log.user_id,
          actorName,
          actorRole: meta?.actor_role,
          isProxy: !!meta?.proxy_mode,
          friendlyMessage: ACTION_MAP[log.action] || log.action,
          details: log.new_data
        } as AuditLogEntry;
      });
    }
  });
};
