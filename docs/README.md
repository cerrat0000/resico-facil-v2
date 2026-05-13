# Resico Fácil — Documentación Técnica y Funcional

## Índice
1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Modelo de Datos](#modelo-de-datos)
5. [Roles y Permisos](#roles-y-permisos)
6. [Políticas RLS](#políticas-rls)
7. [Storage](#storage)
8. [Edge Functions](#edge-functions)
9. [Módulos Funcionales](#módulos-funcionales)
10. [Flujos Principales](#flujos-principales)
11. [Guía de Despliegue](#guía-de-despliegue)
12. [Fases del Proyecto](#fases-del-proyecto)
13. [Riesgos y Supuestos](#riesgos-y-supuestos)

---

## Descripción General

**Resico Fácil** es una plataforma SaaS fiscal diseñada exclusivamente para personas físicas inscritas en el Régimen Simplificado de Confianza (RESICO) en México. Ayuda a comerciantes y pequeños contribuyentes a:

- Registrar ingresos y gastos de forma simple
- Organizar su expediente digital fiscal
- Generar formularios listos para presentar al SAT
- Colaborar con un contador
- Construir historial útil para créditos y apoyos

## Arquitectura

```
┌─────────────────────────────────────────┐
│           Frontend (React + PWA)         │
│  Vite · Tailwind · TypeScript · shadcn  │
└──────────────┬──────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────┐
│          Supabase Cloud                  │
│  ┌─────────┐ ┌─────────┐ ┌───────────┐ │
│  │  Auth    │ │ Postgres│ │  Storage  │ │
│  └─────────┘ └─────────┘ └───────────┘ │
│  ┌──────────────────────────────────┐   │
│  │      Edge Functions (Deno)       │   │
│  │  Tax calc · OCR · Payments · etc │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Monolito modular** sobre Supabase. Sin microservicios en la primera etapa.

### Dominios separados:
1. Identidad y acceso
2. Perfil fiscal
3. Ingresos y gastos
4. Documentos y expediente digital
5. Declaración asistida
6. Relación contador-cliente
7. Suscripciones y pagos
8. Apoyos y créditos
9. Capacitación y tutoriales
10. Panel administrativo
11. Analítica y métricas
12. Auditoría
13. Sincronización offline

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS + shadcn/ui |
| Estado | React Query (TanStack) |
| Auth | Supabase Auth |
| Base de datos | Supabase Postgres |
| Storage | Supabase Storage |
| Server-side | Supabase Edge Functions (Deno) |
| PWA | Service Worker + Manifest |

## Modelo de Datos

### Diagrama Entidad-Relación (textual)

```
auth.users ──1:1──> profiles
auth.users ──1:N──> user_roles
auth.users ──1:1──> taxpayer_profiles
auth.users ──1:N──> income_records
auth.users ──1:N──> expense_records
auth.users ──1:N──> documents
auth.users ──1:N──> tax_periods
auth.users ──1:N──> declaration_drafts
auth.users ──1:1──> accountant_profiles
auth.users ──M:N──> accountant_client_links (pivote)
auth.users ──1:N──> user_subscriptions
auth.users ──1:N──> payment_transactions
auth.users ──1:N──> tutorial_progress
auth.users ──1:N──> support_tickets
auth.users ──1:N──> support_applications
auth.users ──1:N──> sync_queue
auth.users ──1:N──> audit_logs

tax_periods ──1:N──> declaration_drafts
subscription_plans ──1:N──> user_subscriptions
support_programs ──1:N──> support_applications
tutorials ──1:N──> tutorial_progress
document_types ──1:N──> documents
transaction_categories ──1:N──> income_records
transaction_categories ──1:N──> expense_records
```

### Tablas principales (20+)

| Tabla | Propósito |
|---|---|
| `profiles` | Datos personales del usuario |
| `user_roles` | Roles (taxpayer, accountant, admin, supervisor) |
| `taxpayer_profiles` | RFC, CURP, domicilio fiscal, actividad |
| `income_records` | Ingresos con categoría, monto, fecha, periodo |
| `expense_records` | Gastos con categoría, deducibilidad |
| `documents` | Archivos subidos con estado de verificación |
| `document_types` | Catálogo de tipos de documento |
| `transaction_categories` | Categorías de ingreso/gasto |
| `tax_periods` | Periodos fiscales (año/mes) |
| `declaration_drafts` | Borradores de declaración |
| `accountant_profiles` | Perfil profesional del contador |
| `accountant_client_links` | Relación M:N contador-cliente con permisos |
| `accountant_notes` | Observaciones del contador |
| `subscription_plans` | Planes de suscripción |
| `user_subscriptions` | Suscripción activa del usuario |
| `payment_transactions` | Historial de pagos |
| `tutorials` | Contenido de tutoriales |
| `tutorial_progress` | Progreso del usuario en tutoriales |
| `support_tickets` | Tickets de soporte |
| `support_programs` | Programas de apoyo/crédito |
| `support_applications` | Solicitudes a programas |
| `sync_queue` | Cola de sincronización offline |
| `audit_logs` | Bitácora de auditoría |

### Características del diseño:
- UUIDs como claves primarias
- Un solo RFC por cuenta
- Soft delete via campo `status`
- Timestamps automáticos (`created_at`, `updated_at`)
- Triggers para `updated_at`
- Índices en `user_id`, `period_year`, `period_month`, `rfc`, `status`
- Índices compuestos para búsquedas por usuario + periodo

## Roles y Permisos

### Roles definidos (enum `app_role`):

| Rol | Acceso |
|---|---|
| **taxpayer** | Solo sus propios datos. CRUD ingresos/gastos/documentos. Ver declaraciones y pagos |
| **accountant** | Clientes asignados y autorizados. Leer info, crear notas/tareas, corregir con trazabilidad |
| **admin** | Operaciones via Edge Functions. Gestión de usuarios, pagos, tutoriales, soporte. Todo auditado |
| **supervisor** | Vistas agregadas y métricas. Sin acceso granular a datos sensibles |

### Función de verificación de roles:
```sql
public.has_role(_user_id UUID, _role app_role) → BOOLEAN
```
Es `SECURITY DEFINER` para evitar recursión en RLS.

## Políticas RLS

Todas las tablas tienen RLS habilitado. Las políticas se organizan por principio:

### Contribuyente (taxpayer):
- `profiles`: SELECT/UPDATE/INSERT solo donde `auth.uid() = user_id`
- `taxpayer_profiles`: SELECT/INSERT/UPDATE solo propios
- `income_records`: CRUD completo solo propios
- `expense_records`: CRUD completo solo propios
- `documents`: SELECT/INSERT/UPDATE solo propios
- `tax_periods`: SELECT/INSERT/UPDATE solo propios
- `declaration_drafts`: SELECT/INSERT/UPDATE solo propios
- `payment_transactions`: SELECT/INSERT solo propios

### Contador (accountant):
- Acceso a datos de clientes via `accountant_client_links` con `status = 'active'`
- Puede leer: `taxpayer_profiles`, `income_records`, `expense_records`, `documents` de clientes asignados
- Puede crear: `accountant_notes` para sus clientes
- Storage: puede ver documentos de clientes asignados

### Admin:
- `audit_logs`: SELECT con `has_role(auth.uid(), 'admin')`
- `tutorials`: ALL con `has_role(auth.uid(), 'admin')`
- `support_programs`: ALL con `has_role(auth.uid(), 'admin')`
- `transaction_categories`: ALL con `has_role(auth.uid(), 'admin')`

## Storage

### Buckets configurados:

| Bucket | Público | Uso |
|---|---|---|
| `taxpayer-documents` | No | Constancias, documentos fiscales |
| `tickets-expenses` | No | Tickets y comprobantes de gastos |
| `identity-documents` | No | INE, CURP, identificaciones |
| `declaration-pdfs` | No | PDFs de declaraciones generadas |
| `support-files` | No | Archivos de soporte |
| `tutorial-assets` | Sí | Imágenes y recursos de tutoriales |

### Estructura de rutas:
```
/{user_id}/archivo.pdf
```

### Políticas de Storage:
- Usuarios solo ven/suben archivos en su carpeta (`auth.uid()::text = foldername[1]`)
- Contadores ven documentos de clientes asignados via `accountant_client_links`
- Tutorial assets son públicos

## Edge Functions

### Funciones propuestas:

| Función | Propósito | Input | Tablas |
|---|---|---|---|
| `calculate-tax-period` | Calcula resumen fiscal del periodo | `{ user_id, year, month }` | income_records, expense_records, tax_periods |
| `generate-declaration-form` | Genera PDF de formulario | `{ tax_period_id }` | tax_periods, declaration_drafts |
| `process-ocr-document` | OCR de ticket/documento | `{ document_id, file_url }` | documents |
| `create-payment-order` | Genera orden de pago | `{ user_id, plan_id }` | payment_transactions, user_subscriptions |
| `confirm-payment-webhook` | Webhook de confirmación | `{ provider_data }` | payment_transactions |
| `send-reminders` | Envía recordatorios | `{ type }` | profiles, tax_periods |
| `share-expediente` | Comparte expediente | `{ user_id, recipient }` | documents, expediente_shares |
| `evaluate-eligibility` | Evalúa elegibilidad | `{ user_id, program_id }` | support_programs, taxpayer_profiles |
| `admin-user-actions` | Acciones admin | `{ action, target_user_id }` | audit_logs |
| `sync-offline-batch` | Sincroniza datos offline | `{ records[] }` | sync_queue |

Cada función:
- Valida JWT del usuario
- Valida inputs con esquemas
- Verifica permisos
- Maneja errores con mensajes claros
- Registra en audit_logs
- Retorna respuesta estándar `{ success, data, error }`

## Módulos Funcionales

### A. Onboarding y perfil fiscal
- Registro con email/contraseña
- Captura de RFC, CURP, domicilio, actividad económica
- Validación de formatos (RFC: 12-13 chars alfanumérico)
- Aceptación de términos

### B. Registro de ingresos y gastos
- Captura manual con categorías
- Filtros por periodo
- Edición con trazabilidad
- Carga de evidencia (foto de ticket)
- Resumen mensual

### C. Expediente digital
- Carga de documentos requeridos
- Barra de completitud
- Estados de verificación
- Historial documental

### D. OCR e IA documental (Edge Function)
- Lectura de tickets
- Extracción de fecha, monto, comercio
- Prellenado sugerido

### E. Declaración asistida
- Wizard paso a paso (4 pasos)
- Cálculo estimado por periodo
- Generación de formulario PDF

### F. Módulo contador
- Cartera de clientes
- Permisos granulares
- Notas y observaciones

### G. Pagos
- Plan gratuito, básico ($149), profesional ($299)
- Subsidio primer año
- Historial de pagos

### H. Apoyos y créditos
- Catálogo de programas
- Elegibilidad básica
- Solicitud de interés

### I. Tutoriales
- 6 mini-tutoriales iniciales
- Progreso del usuario

### J. Panel administrativo (futuro)
- Gestión de usuarios, pagos, soporte

## Flujos Principales

1. **Registro** → Email/contraseña → Perfil → Datos fiscales → Dashboard
2. **Captura diaria** → Dashboard → "+Registrar" → Tipo/Monto/Categoría → Guardar
3. **Carga documental** → Expediente → Subir archivo → Verificación pendiente
4. **Declaración** → Wizard 4 pasos → Revisar → Generar formulario
5. **Contador** → Vincular cliente → Ver datos → Agregar notas
6. **Pago** → Elegir plan → Método de pago → Confirmar
7. **Apoyo/crédito** → Ver programas → Verificar elegibilidad → Solicitar
8. **Tutorial** → Seleccionar tema → Completar → Progreso

## Guía de Despliegue

1. El proyecto está integrado con Lovable Cloud (Supabase)
2. La base de datos se crea automáticamente via migraciones
3. Las Edge Functions se despliegan desde `supabase/functions/`
4. El frontend se publica via Lovable Publish

### Variables de entorno necesarias:
- `VITE_SUPABASE_URL` (automático)
- `VITE_SUPABASE_ANON_KEY` (automático)

## Fases del Proyecto

### FASE 1 — MVP (actual)
✅ Autenticación (registro, login, recuperación)
✅ Perfil fiscal
✅ Ingresos y gastos
✅ Expediente digital
✅ Declaración asistida (wizard)
✅ Pagos y suscripciones (UI)
✅ Tutoriales
✅ Apoyos y créditos (catálogo)
✅ Base de datos completa con RLS
✅ Storage con políticas
⬜ OCR básico (Edge Function)
⬜ Contador multi-cliente (UI)
⬜ Panel admin
⬜ PWA offline parcial

### FASE 2 — Integraciones
- Pagos reales (Stripe/OXXO)
- Chatbot WhatsApp
- Recordatorios automáticos
- OCR mejorado
- Reportes automatizados

### FASE 3 — Escalabilidad
- Motor de reglas fiscales
- APIs externas SAT
- Analítica avanzada
- Optimización de performance

### FASE 4 — Inteligencia
- Biometría
- Asistente inteligente
- Predicción de abandono
- Automatización documental

## Riesgos y Supuestos

### Supuestos del MVP:
- Un usuario = un RFC = un contribuyente
- Solo RESICO en primera etapa
- Cálculos fiscales son estimativos, no oficiales
- Los formularios generados requieren revisión del contribuyente
- El OCR es complementario, no sustitutivo

### Riesgos técnicos:
- **Carga documental**: mitigado con buckets separados y límites de archivo
- **Picos mensuales**: mitigado con índices compuestos y consultas optimizadas
- **Concurrencia**: PostgreSQL maneja bien hasta 20K usuarios
- **Offline**: IndexedDB + sync queue puede tener conflictos → resolución manual
- **OCR accuracy**: depende del proveedor externo

### Riesgos operativos:
- Cambios en regulación fiscal del SAT
- Adopción lenta por baja alfabetización digital
- Costo de almacenamiento con carga documental intensiva
