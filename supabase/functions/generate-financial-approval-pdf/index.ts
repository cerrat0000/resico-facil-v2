// Genera carta de aprobación financiera (preliminar, NO contrato).
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmt = (n: number) =>
  `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const admin = createClient(supaUrl, service);

    const { applicationId } = await req.json();
    if (!applicationId) throw new Error("Missing applicationId");

    const { data: app, error: aErr } = await admin.from("financial_applications").select("*").eq("id", applicationId).maybeSingle();
    if (aErr || !app) throw new Error("Solicitud no encontrada");
    if (app.user_id !== userId) throw new Error("Forbidden");
    if (!["approved","pending_release"].includes(app.status)) throw new Error("La solicitud aún no está aprobada");

    const { data: profile } = await admin.from("taxpayer_profiles").select("rfc").eq("user_id", userId).maybeSingle();
    const { data: prof } = await admin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const green = rgb(0.13, 0.55, 0.35);
    const dark = rgb(0.13, 0.18, 0.22);
    const muted = rgb(0.45, 0.5, 0.55);

    let y = 750;
    page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: green });
    page.drawText("Resico Fácil", { x: 40, y: 762, size: 18, font: bold, color: rgb(1,1,1) });
    page.drawText("Carta de aprobación financiera (preliminar)", { x: 40, y: 746, size: 10, font, color: rgb(1,1,1) });

    y = 700;
    page.drawText(`Folio: ${app.folio}`, { x: 40, y, size: 11, font: bold, color: dark });
    page.drawText(`Fecha: ${new Date(app.approved_at ?? app.created_at).toLocaleDateString("es-MX")}`, { x: 400, y, size: 11, font, color: dark });

    y -= 40;
    page.drawText("Solicitante", { x: 40, y, size: 12, font: bold, color: dark }); y -= 18;
    page.drawText(`Nombre: ${prof?.full_name || "—"}`, { x: 40, y, size: 11, font, color: dark }); y -= 16;
    page.drawText(`RFC: ${profile?.rfc || "—"}`, { x: 40, y, size: 11, font, color: dark });

    y -= 40;
    page.drawText("Resultado de la evaluación", { x: 40, y, size: 12, font: bold, color: dark }); y -= 24;

    const rows: [string, string][] = [
      ["Monto aprobado", fmt(Number(app.approved_amount ?? 0))],
      ["Plazo", `${app.approved_term_months ?? app.term_months} meses`],
      ["Pago mensual estimado", fmt(Number(app.approved_monthly_payment ?? app.estimated_monthly_payment))],
      ["Tasa mensual estimada", `${(Number(app.monthly_rate) * 100).toFixed(2)}%`],
      ["CAT estimado", `${(Number(app.cat_estimate) * 100).toFixed(1)}%`],
      ["Estado", "Pendiente de liberación"],
    ];
    for (const [k, v] of rows) {
      page.drawText(k, { x: 40, y, size: 11, font, color: muted });
      page.drawText(v, { x: 320, y, size: 11, font: bold, color: dark });
      y -= 18;
    }

    y -= 24;
    page.drawRectangle({ x: 40, y: y - 50, width: 532, height: 60, color: rgb(0.96, 0.97, 0.95) });
    const note =
      "Este documento es preliminar y sirve únicamente como referencia de tu evaluación financiera.\n" +
      "El monto y condiciones definitivas están sujetos a validación final y no constituyen un contrato.";
    let ny = y - 18;
    for (const line of note.split("\n")) {
      page.drawText(line, { x: 52, y: ny, size: 9, font, color: dark });
      ny -= 14;
    }

    page.drawText("Resico Fácil — Documento generado automáticamente", { x: 40, y: 40, size: 8, font, color: muted });

    const bytes = await pdf.save();
    const path = `${userId}/${app.id}.pdf`;
    const { error: upErr } = await admin.storage.from("financial-approvals").upload(path, bytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) throw upErr;

    await admin.from("financial_applications").update({
      pdf_path: path, pdf_generated_at: new Date().toISOString(),
    }).eq("id", app.id);

    const { data: signed } = await admin.storage.from("financial-approvals").createSignedUrl(path, 3600);

    return new Response(JSON.stringify({ ok: true, path, url: signed?.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
