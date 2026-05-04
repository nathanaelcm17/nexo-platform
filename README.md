# ◈ Nexo Platform

**Plataforma reutilizable + NexoLaundry (primer vertical)**

Monorepo de la plataforma Nexo. Contiene el núcleo genérico reutilizable (`@nexo/core-*`), adaptadores intercambiables (`@nexo/adapter-*`), verticales de negocio (`@nexo/vertical-*`) y las aplicaciones finales que los componen.

---

## Estructura

```
nexo-platform/
├── packages/
│   ├── core/                      Núcleo genérico (reutilizable entre verticales)
│   │   ├── shared-kernel/         Value objects, eventos base, branded types
│   │   ├── platform-runtime/      Orquestador de registro de verticales
│   │   ├── identity/              Identity & Access (paquete de referencia ✓)
│   │   ├── customers/             CRM operativo
│   │   ├── catalog/               Servicios, productos, pricing
│   │   ├── orders/                Órdenes genéricas (delega a fulfillment)
│   │   ├── billing/               NCF, facturas, notas de crédito
│   │   ├── payments/              Transacciones y tokens
│   │   ├── pos-cash/              Caja, arqueo, turnos
│   │   ├── notifications/         Orquestador multicanal
│   │   ├── audit/                 Log append-only + Event Store
│   │   └── reporting-core/        Read models genéricos
│   │
│   ├── adapters/                  Integraciones externas intercambiables
│   │   └── storage-s3/            Almacenamiento de archivos
│   │                              (payments-azul, billing-dgii-do,
│   │                               messaging-whatsapp → Fase 3)
│   │
│   └── verticals/                 Lógica específica de cada negocio
│       └── laundry/               Operations de lavandería (vertical inicial)
│
├── apps/
│   ├── nexolaundry-api/           Backend Express (compositor)
│   ├── nexolaundry-pos/           POS web responsive (React + Vite)
│   └── nexolaundry-backoffice/    Panel administrativo (React + Vite)
│
├── tools/
│   ├── provisioner/               Scripts para provisionar tenants
│   └── migrations/                Runner de migraciones SQL
│
├── db/
│   └── migrations/                DDL PostgreSQL (schema público + template tenant)
│
├── docs/
│   └── adr/                       Architecture Decision Records (15 ADRs)
│
└── .github/workflows/             CI con GitHub Actions
```

---

## Requisitos

- **Node.js** ≥ 20.10
- **pnpm** ≥ 9.0
- **PostgreSQL** 16+
- **Redis** 7+

---

## Setup inicial

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar variables de entorno
cp .env.example .env
# (editar .env con credenciales locales)

# 3. Aplicar schema público (una sola vez)
pnpm db:migrate

# 4. Provisionar un tenant de desarrollo
pnpm db:provision-tenant -- --slug=demo --name="Demo Lavandería" --rnc=123456789

# 5. Levantar backend y frontends
pnpm dev:api          # http://localhost:3000
pnpm dev:pos          # http://localhost:5173
pnpm dev:backoffice   # http://localhost:5174
```

---

## Comandos clave

| Comando | Descripción |
|---|---|
| `pnpm build` | Compila todos los paquetes |
| `pnpm test` | Ejecuta tests de todos los paquetes |
| `pnpm lint` | Linter con reglas de ADR-004 y ADR-009 (bloquea imports cross-vertical) |
| `pnpm typecheck` | Verificación de tipos TypeScript |
| `pnpm format` | Prettier sobre todo el repo |
| `pnpm db:migrate` | Aplica schema público |
| `pnpm db:provision-tenant` | Crea un tenant nuevo con su schema |

---

## Reglas arquitectónicas críticas

Las reglas están implementadas en el linter (ver `.eslintrc.cjs`). Si intentas violarlas, el build falla.

1. **El núcleo nunca importa de un vertical.** `@nexo/core-*` no conoce `@nexo/vertical-*`.
2. **Un vertical no importa de otro vertical.** Aislamiento estricto entre verticales.
3. **El núcleo no contiene `if (vertical === 'laundry')`.** Polimorfismo via `fulfillmentType`, `pricingModel.kind`, etc.
4. **Apps son compositores.** No contienen lógica de negocio; solo ensamblan núcleo + adapters + vertical.
5. **Eventos de dominio versionados con SemVer.** Cambios breaking requieren dual publishing (ver ADR-006).

---

## Paquete de referencia

`packages/core/identity/` está construido como paquete de referencia completo:

- `src/domain/` — Agregados (User, Tenant) con invariantes de negocio
- `src/domain/ports.ts` — Interfaces de repositorios y servicios
- `src/application/` — Casos de uso (LoginUseCase)
- `src/infrastructure/` — Adaptadores (Argon2PasswordHasher, JwtTokenService)
- `tests/` — Tests unitarios del dominio (sin infraestructura)

Los demás paquetes del núcleo deben seguir esta misma estructura al implementarse.

---

## Próximos pasos del equipo de desarrollo

**Fase 0 (4 semanas):**
1. Implementar event bus real con BullMQ + Redis (reemplazar stub en `apps/nexolaundry-api/src/main.ts`).
2. Implementar repositorios PostgreSQL con Drizzle para Identity.
3. Middleware Express para resolución de tenant por subdominio (`SET search_path`).
4. Controladores HTTP de Identity (login, refresh, logout).
5. CI completo con base de datos de test.

**Fase 1 (10-12 semanas):**
6. Implementar cada bounded context siguiendo el patrón de `identity/`.
7. Integrar el vertical laundry con Orders (suscripción a OrderConfirmed).
8. Construir UIs del POS y backoffice.

Ver documento `NexoLaundry_Roadmap.docx` para el plan completo.

---

## Documentación

- **Arquitectura general** → `NexoLaundry_Arquitectura_v1.docx`
- **Roadmap por fases** → `NexoLaundry_Roadmap.docx`
- **Decisiones arquitectónicas** → `NexoLaundry_ADRs.docx`
- **Diagramas C4** → `NexoLaundry_C4.docx`
- **Modelo de datos** → `NexoLaundry_Modelo_Datos.docx`

---

**Nexovix Soluciones Tecnológicas** · 2026
