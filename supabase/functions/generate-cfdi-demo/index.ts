// Genera un PDF estilo CFDI demostrativo (NO fiscal) tras el pago de una declaración.
// Usa pdf-lib para construir el documento y guarda en bucket privado cfdi-demos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const userId = claims.claims.sub as string;

    const { declarationId } = await req.json();
    if (!declarationId) throw new Error("Missing declarationId");

    const admin = createClient(supaUrl, service);
    const { data: draft, error: dErr } = await admin
      .from("declaration_drafts")
      .select("id, user_id, calculation_id, period_year, period_month, payment_status, paid_at, payment_amount, cfdi_demo_path, cfdi_demo_folio")
      .eq("id", declarationId)
      .maybeSingle();
    if (dErr || !draft) throw new Error("Declaración no encontrada");
    if (draft.user_id !== userId) throw new Error("Forbidden");
    if (draft.payment_status !== "paid") throw new Error("La declaración aún no está pagada");

    const { data: calc } = await admin
      .from("tax_calculations")
      .select("total_income, total_expenses, taxable_base, estimated_tax")
      .eq("id", draft.calculation_id!)
      .maybeSingle();

    const { data: profile } = await admin
      .from("taxpayer_profiles").select("rfc").eq("user_id", userId).maybeSingle();
    const { data: prof } = await admin
      .from("profiles").select("full_name").eq("user_id", userId).maybeSingle();

    // Folio + UUID + sello DEMO (deterministas por declaración)
    const folio = draft.cfdi_demo_folio
      ?? `DEMO-${String(draft.period_year)}${String(draft.period_month).padStart(2, "0")}-${draft.id.slice(0, 8).toUpperCase()}`;
    const uuid = `${draft.id.slice(0,8)}-${draft.id.slice(8,12)}-${draft.id.slice(12,16)}-${draft.id.slice(16,20)}-${draft.id.slice(20,32)}`.toUpperCase();
    const sello = (await sha256(`${draft.id}|${draft.paid_at ?? ""}|demo`)).slice(0, 64);
    const fechaPago = draft.paid_at ? new Date(draft.paid_at) : new Date();
    const subtotal = Number(calc?.taxable_base ?? 0);
    const isr = Number(draft.payment_amount ?? calc?.estimated_tax ?? 0);

    // Construye PDF
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const green = rgb(0.04, 0.53, 0.32);
    const dark = rgb(0.13, 0.16, 0.18);
    const muted = rgb(0.45, 0.49, 0.52);

    // Header
    page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: green });
    page.drawText("Comprobante de pago", { x: 32, y: 808, size: 16, font: bold, color: rgb(1,1,1) });
    page.drawText("Declaración RESICO — Documento demostrativo", { x: 32, y: 788, size: 10, font, color: rgb(1,1,1) });
    page.drawText("DEMO", { x: 510, y: 800, size: 22, font: bold, color: rgb(1,1,1) });

    // Folio + UUID
    let y = 740;
    page.drawText(`Folio: ${folio}`, { x: 32, y, size: 10, font: bold, color: dark });
    page.drawText(`UUID demo: ${uuid}`, { x: 32, y: y - 14, size: 9, font, color: muted });
    page.drawText(`Fecha: ${fechaPago.toLocaleString("es-MX")}`, { x: 380, y, size: 10, font, color: dark });

    // Receptor
    y = 700;
    page.drawText("RECEPTOR", { x: 32, y, size: 9, font: bold, color: muted });
    page.drawText(prof?.full_name ?? "Contribuyente", { x: 32, y: y - 14, size: 11, font: bold, color: dark });
    page.drawText(`RFC: ${profile?.rfc ?? "XAXX010101000"}`, { x: 32, y: y - 28, size: 10, font, color: dark });
    page.drawText("Régimen: RESICO Personas Físicas", { x: 32, y: y - 42, size: 10, font, color: dark });
    page.drawText(`Periodo: ${String(draft.period_month).padStart(2,"0")}/${draft.period_year}`, { x: 32, y: y - 56, size: 10, font, color: dark });

    // Tabla de conceptos
    y = 600;
    page.drawRectangle({ x: 32, y: y - 4, width: 531, height: 22, color: rgb(0.95, 0.97, 0.96) });
    page.drawText("CONCEPTO", { x: 40, y: y + 2, size: 9, font: bold, color: dark });
    page.drawText("IMPORTE", { x: 480, y: y + 2, size: 9, font: bold, color: dark });

    const rows: [string, number][] = [
      ["Base gravable del periodo", subtotal],
      ["ISR estimado RESICO", isr],
    ];
    let ry = y - 24;
    rows.forEach(([label, val]) => {
      page.drawText(label, { x: 40, y: ry, size: 10, font, color: dark });
      page.drawText(fmt(val), { x: 470, y: ry, size: 10, font, color: dark });
      ry -= 20;
    });

    // Totales
    ry -= 10;
    page.drawLine({ start: { x: 320, y: ry + 14 }, end: { x: 563, y: ry + 14 }, color: muted, thickness: 0.5 });
    page.drawText("Subtotal:", { x: 350, y: ry, size: 10, font, color: dark });
    page.drawText(fmt(subtotal), { x: 470, y: ry, size: 10, font, color: dark });
    page.drawText("Total pagado:", { x: 350, y: ry - 18, size: 11, font: bold, color: green });
    page.drawText(fmt(isr), { x: 470, y: ry - 18, size: 11, font: bold, color: green });

    // Sello DEMO
    y = 360;
    page.drawText("SELLO DIGITAL DEMOSTRATIVO", { x: 32, y, size: 9, font: bold, color: muted });
    // Wrap sello in two lines
    page.drawText(sello.slice(0, 64), { x: 32, y: y - 14, size: 7, font, color: dark });

    // QR demo (texto simple - el QR real requiere otra dependencia, mostramos referencia)
    page.drawRectangle({ x: 32, y: 220, width: 90, height: 90, borderColor: dark, borderWidth: 1 });
    page.drawText("QR DEMO", { x: 50, y: 260, size: 10, font: bold, color: dark });
    page.drawText("(no fiscal)", { x: 47, y: 245, size: 8, font, color: muted });
    page.drawText(`Verifica este folio en tu cuenta de Resico Fácil.`, { x: 138, y: 280, size: 9, font, color: muted });
    page.drawText(`Folio: ${folio}`, { x: 138, y: 264, size: 9, font: bold, color: dark });

    // Disclaimer footer
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 70, color: rgb(0.99, 0.95, 0.91) });
    page.drawText("DOCUMENTO DEMOSTRATIVO — NO FISCAL", { x: 32, y: 46, size: 11, font: bold, color: rgb(0.78, 0.32, 0.18) });
    page.drawText("Este comprobante es informativo. No sustituye al CFDI emitido por el SAT y no es válido", { x: 32, y: 30, size: 8, font, color: muted });
    page.drawText("para efectos fiscales. Para tu CFDI oficial, consulta el portal del SAT.", { x: 32, y: 18, size: 8, font, color: muted });

    const pdfBytes = await pdf.save();

    const path = `${userId}/${draft.id}/cfdi-demo-${folio}.pdf`;
    const { error: upErr } = await admin.storage
      .from("cfdi-demos")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    await admin.from("declaration_drafts").update({
      cfdi_demo_path: path,
      cfdi_demo_folio: folio,
      cfdi_generated_at: new Date().toISOString(),
    }).eq("id", declarationId);

    const { data: signed, error: sErr } = await admin.storage
      .from("cfdi-demos").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (sErr) throw sErr;

    return new Response(JSON.stringify({ url: signed.signedUrl, path, folio }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cfdi-demo error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
