import { supabase } from "@/integrations/supabase/client";

/**
 * Registra una acción en la tabla de auditoría.
 * Especialmente útil para el Modo Proxy del contador.
 */
export const logAuditAction = async ({
  action,
  tableName,
  recordId,
  oldData,
  newData,
  clientId,
  actorRole,
  isProxyMode
}: {
  action: string;
  tableName?: string;
  recordId?: string;
  oldData?: any;
  newData?: any;
  clientId?: string;
  actorRole?: string;
  isProxyMode?: boolean;
}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    // Si no se pasan los roles/proxy, intentamos inferirlos del contexto de datos
    // Pero es mejor que los llamadores los pasen para precisión.

    const auditEntry = {
      user_id: user.id, // El ID del actor (quien hace la acción)
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData,
      new_data: {
        ...newData,
        _metadata: {
          actor_role: actorRole || "unknown",
          proxy_mode: isProxyMode || !!clientId,
          target_user_id: clientId || user.id,
          timestamp: new Date().toISOString()
        }
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert(auditEntry);

    if (error) {
      console.error("Error al registrar auditoría:", error);
    }
  } catch (err) {
    console.error("Fallo crítico en logger de auditoría:", err);
  }
};
