import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AccountantClientRow {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  permissions: { read: boolean; edit: boolean; documents: boolean } | null;
  client_name?: string | null;
  client_rfc?: string | null;
  canEdit?: boolean;
}

export const useAccountantClients = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["accountant_clients", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AccountantClientRow[]> => {
      const { data: links, error } = await supabase
        .from("accountant_client_links")
        .select("id, client_id, status, created_at, permissions")
        .eq("accountant_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (links ?? []).map((l) => l.client_id);
      if (ids.length === 0) return [];

      const [{ data: profs }, { data: tps }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("taxpayer_profiles").select("user_id, rfc").in("user_id", ids),
      ]);

      return (links ?? []).map((l) => {
        const perms = (l.permissions ?? {}) as { read?: boolean; edit?: boolean; documents?: boolean };
        return {
          ...l,
          permissions: {
            read: perms.read ?? true,
            edit: perms.edit ?? false,
            documents: perms.documents ?? true,
          },
          client_name: profs?.find((p) => p.user_id === l.client_id)?.full_name ?? null,
          client_rfc: tps?.find((t) => t.user_id === l.client_id)?.rfc ?? null,
          canEdit: perms.edit === true,
        };
      });
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });

  const inviteByRfc = useMutation({
    mutationFn: async (rfc: string) => {
      if (!user) throw new Error("No user");
      const cleanRfc = rfc.trim().toUpperCase();

      const { data, error } = await supabase.rpc("accountant_invite_by_rfc", {
        p_rfc: cleanRfc,
      });

      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data) throw new Error((data as any).error);

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accountant_clients", user?.id] }),
  });

  const setEditPermission = useMutation({
    mutationFn: async ({ linkId, canEdit }: { linkId: string; canEdit: boolean }) => {
      const { data, error } = await supabase.rpc("accountant_set_edit_permission", {
        p_link_id: linkId,
        p_can_edit: canEdit,
      });
      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data) throw new Error((data as any).error);
      return data;
    },
    onMutate: async ({ linkId, canEdit }) => {
      await qc.cancelQueries({ queryKey: ["accountant_clients", user?.id] });
      const previousClients = qc.getQueryData<AccountantClientRow[]>(["accountant_clients", user?.id]);
      if (previousClients) {
        qc.setQueryData<AccountantClientRow[]>(
          ["accountant_clients", user?.id],
          previousClients.map((client) =>
            client.id === linkId
              ? { ...client, canEdit, permissions: { ...client.permissions, edit: canEdit, read: true, documents: true } }
              : client
          )
        );
      }
      return { previousClients };
    },
    onError: (_err, _newVal, context) => {
      if (context?.previousClients) {
        qc.setQueryData(["accountant_clients", user?.id], context.previousClients);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["accountant_clients", user?.id] });
    },
  });

  return { ...list, inviteByRfc, setEditPermission };
};

export const usePendingInvitations = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["my_invitations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("accountant_client_links")
        .select("id, accountant_id, status, created_at")
        .eq("client_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (links ?? []).map((l) => l.accountant_id);
      if (ids.length === 0) return [];

      const [{ data: profs }, { data: accProfs }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("accountant_profiles").select("user_id, specialization, license_number").in("user_id", ids),
      ]);

      return (links ?? []).map((l) => ({
        ...l,
        accountant_name: profs?.find((p) => p.user_id === l.accountant_id)?.full_name ?? "Contador",
        specialization: accProfs?.find((p) => p.user_id === l.accountant_id)?.specialization ?? null,
        license_number: accProfs?.find((p) => p.user_id === l.accountant_id)?.license_number ?? null,
      }));
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (!user) throw new Error("No user");
      const status = accept ? "active" : "rejected";
      const { error } = await supabase
        .from("accountant_client_links")
        .update({ status })
        .eq("id", id)
        .eq("client_id", user.id);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: accept ? "accountant.link.accept" : "accountant.link.reject",
        table_name: "accountant_client_links",
        record_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_invitations", user?.id] });
      qc.invalidateQueries({ queryKey: ["accountant_clients"] });
    },
  });

  return { ...list, respond };
};
