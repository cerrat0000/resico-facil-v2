import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface LinkedAccountant {
  id: string;
  accountant_id: string;
  status: 'active' | 'pending' | 'revoked' | 'read_only';
  created_at: string;
  permissions: { read: boolean; edit: boolean; documents: boolean };
  accountant_name?: string;
  specialization?: string;
  license_number?: string;
}

export const useClientAccountant = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["my_accountant", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<LinkedAccountant | null> => {
      const { data: links, error } = await supabase
        .from("accountant_client_links")
        .select("id, accountant_id, status, created_at, permissions")
        .eq("client_id", user!.id)
        .in("status", ["active", "pending", "read_only"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!links || links.length === 0) return null;

      const link = links[0];
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", link.accountant_id)
        .single();

      const { data: accProfile } = await supabase
        .from("accountant_profiles")
        .select("specialization, license_number")
        .eq("user_id", link.accountant_id)
        .single();

      const perms = (link.permissions ?? {}) as any;

      return {
        ...link,
        status: link.status as any,
        permissions: {
          read: perms.read ?? true,
          edit: perms.edit ?? false,
          documents: perms.documents ?? true,
        },
        accountant_name: profile?.full_name || "Contador",
        specialization: accProfile?.specialization || "",
        license_number: accProfile?.license_number || "",
      };
    },
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ linkId, edit }: { linkId: string; edit: boolean }) => {
      const { error } = await supabase
        .from("accountant_client_links")
        .update({ 
          permissions: { read: true, edit, documents: true },
          status: edit ? 'active' : 'read_only'
        })
        .eq("id", linkId)
        .eq("client_id", user!.id);

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "contador.permission_changed",
        table_name: "accountant_client_links",
        record_id: linkId,
        new_data: { edit_enabled: edit }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_accountant"] });
      toast.success("Permisos del contador actualizados");
    },
  });

  const revokeAccess = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("accountant_client_links")
        .update({ status: "revoked" })
        .eq("id", linkId)
        .eq("client_id", user!.id);

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "contador.access_revoked",
        table_name: "accountant_client_links",
        record_id: linkId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_accountant"] });
      toast.success("Acceso del contador revocado exitosamente");
    },
  });

  return {
    accountant: query.data,
    isLoading: query.isLoading,
    updatePermissions,
    revokeAccess,
  };
};
