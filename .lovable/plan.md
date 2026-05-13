## Alcance

Es un bloque grande. Lo divido en 4 fases independientes para no romper lo existente. Confirma cuáles ejecutar (o si las ejecuto todas seguidas).

---

### Fase 1 — Pagos reales de declaraciones con Stripe

**Objetivo:** que el usuario abra una declaración, pague el ISR con tarjeta y vea el estado actualizado automáticamente.

- Nueva columna `payment_status` en `declaration_drafts` con estados: `pending`, `ready_to_pay`, `paid`, `under_review`.
- Nuevas columnas: `paid_at`, `payment_transaction_id`, `payment_amount`.
- Edge function `create-declaration-payment`: crea Stripe Checkout Session con `price_data` dinámico (monto = ISR de la declaración) en modo `embedded_page`, asocia `metadata.declaration_id` y `metadata.user_id`.
- Edge function `payments-webhook` ampliada: cuando llega `checkout.session.completed` con `metadata.declaration_id`, marca declaración como `paid`, inserta fila en `payment_transactions`.
- UI: badge de estado de pago en cada card de declaración + botón "Pagar ISR" que abre `StripeEmbeddedCheckout` en un Dialog.
- Página de retorno reutiliza `/checkout/return` y refresca la declaración.
- RLS: actualización del estado solo vía service role (webhook).

### Fase 2 — Comprobante CFDI demo (no fiscal)

**Objetivo:** PDF descargable tipo CFDI simplificado tras pago.

- Edge function `generate-cfdi-demo`: genera PDF estilo SAT con RFC, folio demo, fecha, subtotal, ISR, total, UUID demo (uuid v4), sello demo (hash), QR demo (link a la app), watermark "DOCUMENTO DEMOSTRATIVO NO FISCAL".
- Storage: bucket `cfdi-demos` (privado, RLS por user_id).
- Columnas en `declaration_drafts`: `cfdi_demo_path`, `cfdi_demo_folio`, `cfdi_generated_at`.
- UI: tras pago, botón "Descargar comprobante demo" junto al PDF de declaración.

### Fase 3 — Panel Admin

**Objetivo:** vista admin con métricas y gestión.

- Página `/admin` protegida por `has_role(uid, 'admin')`.
- Tabs: Métricas, Usuarios, Declaraciones, Pagos, Suscripciones, Soporte.
- Métricas (vía edge function `admin-metrics` con validación de rol server-side):
  - usuarios registrados / activos últimos 30 días
  - declaraciones generadas
  - pagos realizados + ingresos plataforma
  - tickets abiertos
  - usuarios contador
- Listas paginadas read-only de cada entidad.
- Toda acción sensible en edge functions con check `has_role`.

### Fase 4 — Refinamiento móvil + UX final

- Sticky CTA inferior en `/declarations` (Guardar / Pagar / Descargar) respetando safe-area iPhone (`env(safe-area-inset-bottom)`).
- Loaders skeleton en home de declaraciones.
- Empty states ilustrados.
- `inputMode="decimal"` ya está; añadir `enterKeyHint`.
- Dialog de Stripe full-screen en móvil.
- Mejoras a11y: `aria-label` en botones-icono, focus rings.

---

## Detalles técnicos clave

- Stripe usa el utility compartido `_shared/stripe.ts` (gateway). `verify_jwt = false` para `create-declaration-payment` y `generate-cfdi-demo` (este último valida JWT en código).
- Webhook ya existe (`payments-webhook`) — solo se extiende, no se duplica.
- Migraciones DB en una sola operación al inicio de cada fase.
- No se tocan: `calculate-tax-period`, `generate-declaration-pdf`, snapshots, RLS existentes, hooks `useTaxEngine`.
- El monto del pago = `tax_calculations.estimated_tax` de la versión actual. Mínimo Stripe: 50 centavos.

## No incluido

- CFDI fiscal real con SAT (explícitamente excluido por el usuario).
- Pagos recurrentes para declaraciones (es one-time por declaración).
- Migración de datos históricos.

## Pregunta antes de ejecutar

¿Ejecuto las 4 fases seguidas, o prefieres que empiece solo por Fase 1 (pagos) y vayamos validando?
