// Métricas para panel admin. Valida rol 'admin' server-side.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(supaUrl, service);

    // Verifica rol admin
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDeclarations },
      { count: paidDeclarations },
      { count: openTickets },
      { count: accountantUsers },
      paymentsAgg,
    ] = await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", since30),
      admin.from("declaration_drafts").select("*", { count: "exact", head: true }),
      admin.from("declaration_drafts").select("*", { count: "exact", head: true }).eq("payment_status", "paid"),
      admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
      admin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "accountant"),
      admin.from("payment_transactions").select("amount").eq("status", "completed"),
    ]);

    const revenue = (paymentsAgg.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

    return new Response(JSON.stringify({
      totalUsers: totalUsers ?? 0,
      activeUsers: activeUsers ?? 0,
      totalDeclarations: totalDeclarations ?? 0,
      paidDeclarations: paidDeclarations ?? 0,
      openTickets: openTickets ?? 0,
      accountantUsers: accountantUsers ?? 0,
      revenue,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("admin-metrics error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
