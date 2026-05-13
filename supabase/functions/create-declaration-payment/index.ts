// Crea una sesión de Stripe Checkout para pagar el ISR de una declaración.
// El monto sale de tax_calculations.estimated_tax (o un mínimo de $1 MXN).
// Marca declaration_drafts.stripe_session_id para que el webhook pueda enlazar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      if (options.userId && c.metadata?.userId !== options.userId) {
        await stripe.customers.update(c.id, { metadata: { ...c.metadata, userId: options.userId } });
      }
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

async function assertCanManageTarget(
  admin: ReturnType<typeof createClient>,
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) return;

  const { data: link, error } = await admin
    .from("accountant_client_links")
    .select("permissions, status")
    .eq("accountant_id", actorUserId)
    .eq("client_id", targetUserId)
    .maybeSingle();

  const canEdit = (link?.permissions as any)?.edit === true;
  if (error || !link || link.status !== "active" || !canEdit) {
    throw new Error("Forbidden");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

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
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const actorUserId = claims.claims.sub as string;
    const email = claims.claims.email as string | undefined;

    const body = await req.json();
    const { declarationId, returnUrl, environment } = body;
    const requestedTargetUserId = typeof body?.target_user_id === "string" ? body.target_user_id : null;
    if (!declarationId || typeof declarationId !== "string") throw new Error("Missing declarationId");
    if (!returnUrl) throw new Error("Missing returnUrl");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const admin = createClient(supaUrl, service);

    // Carga la declaración + cálculo
    const { data: draft, error: dErr } = await admin
      .from("declaration_drafts")
      .select("id, user_id, calculation_id, period_year, period_month, payment_status")
      .eq("id", declarationId)
      .maybeSingle();
    if (dErr || !draft) throw new Error("Declaración no encontrada");
    const targetUserId = draft.user_id;
    if (requestedTargetUserId && requestedTargetUserId !== targetUserId) throw new Error("Forbidden");
    await assertCanManageTarget(admin, actorUserId, targetUserId);
    if (draft.payment_status === "paid") throw new Error("Esta declaración ya fue pagada");

    const { data: calc, error: cErr2 } = await admin
      .from("tax_calculations")
      .select("estimated_tax")
      .eq("id", draft.calculation_id!)
      .maybeSingle();
    if (cErr2 || !calc) throw new Error("Cálculo no encontrado");

    const isr = Math.max(1, Math.round(Number(calc.estimated_tax) * 100));
    if (isr < 50) throw new Error("Monto demasiado bajo para procesar pago");

    const env: StripeEnv = environment;
    const stripe = createStripeClient(env);
    const customerId = await resolveOrCreateCustomer(stripe, { email, userId: targetUserId });

    const periodLabel = `${String(draft.period_month).padStart(2, "0")}/${draft.period_year}`;
    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "mxn",
          product_data: {
            name: `Pago ISR — Declaración RESICO ${periodLabel}`,
            description: `Pago del ISR estimado para el periodo ${periodLabel}`,
          },
          unit_amount: isr,
        },
        quantity: 1,
      }],
      mode: "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      automatic_tax: { enabled: false },
      metadata: {
        userId: targetUserId,
        actorUserId,
        declarationId,
        periodYear: String(draft.period_year),
        periodMonth: String(draft.period_month),
        kind: "declaration_isr",
      },
    });

    // Guarda session_id para que el webhook lo reconcilie
    await admin
      .from("declaration_drafts")
      .update({
        stripe_session_id: session.id,
        payment_status: "ready_to_pay",
        payment_amount: Number(calc.estimated_tax),
      })
      .eq("id", declarationId);

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-declaration-payment error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
