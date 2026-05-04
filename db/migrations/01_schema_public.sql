-- ==========================================================================
-- NexoLaundry - DDL Schema Compartido (public)
-- Fase 0 y Fase 1
-- PostgreSQL 16+
-- ==========================================================================
-- Este script crea las tablas compartidas entre todos los tenants:
--   - Gestión de tenants (lavanderías cliente)
--   - Usuarios globales
--   - Catálogo de permisos del sistema
--   - Membresías usuario-tenant
--   - Tokens de autenticación
-- ==========================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";  -- emails case-insensitive

-- --------------------------------------------------------------------------
-- TIPOS ENUM GLOBALES
-- --------------------------------------------------------------------------
CREATE TYPE tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
CREATE TYPE tenant_plan AS ENUM ('starter', 'business', 'enterprise');
CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'locked');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended');

-- --------------------------------------------------------------------------
-- TABLA: tenants
-- Cada lavandería cliente del SaaS
-- --------------------------------------------------------------------------
CREATE TABLE public.tenants (
    tenant_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug              VARCHAR(63) NOT NULL UNIQUE,
    legal_name        VARCHAR(200) NOT NULL,
    trade_name        VARCHAR(200) NOT NULL,
    rnc               VARCHAR(20),
    country           CHAR(2) NOT NULL DEFAULT 'DO',
    timezone          VARCHAR(64) NOT NULL DEFAULT 'America/Santo_Domingo',
    currency          CHAR(3) NOT NULL DEFAULT 'DOP',
    schema_name       VARCHAR(63) NOT NULL UNIQUE,
    plan              tenant_plan NOT NULL DEFAULT 'starter',
    status            tenant_status NOT NULL DEFAULT 'trial',
    trial_ends_at     TIMESTAMPTZ,
    activated_at      TIMESTAMPTZ,
    data_region       VARCHAR(32) NOT NULL DEFAULT 'do-1',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
    CONSTRAINT chk_tenants_schema_format CHECK (schema_name ~ '^tenant_[a-z0-9_]{1,55}$')
);

CREATE INDEX idx_tenants_status ON public.tenants(status) WHERE status IN ('active', 'trial');

COMMENT ON TABLE public.tenants IS 'Lavanderías cliente del SaaS. Un tenant = un cliente.';
COMMENT ON COLUMN public.tenants.slug IS 'Subdominio único: acme → acme.nexolaundry.com';
COMMENT ON COLUMN public.tenants.schema_name IS 'Schema PostgreSQL del tenant, ej. tenant_acme';

-- --------------------------------------------------------------------------
-- TABLA: tenant_settings
-- Configuración extendida del tenant (separada para no crecer la tabla principal)
-- --------------------------------------------------------------------------
CREATE TABLE public.tenant_settings (
    tenant_id                   UUID PRIMARY KEY REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    branding_logo_url           TEXT,
    branding_primary_color      VARCHAR(7),
    branding_secondary_color    VARCHAR(7),
    tax_config                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    whatsapp_business_number    VARCHAR(20),
    business_hours              JSONB NOT NULL DEFAULT '{}'::jsonb,
    cash_tolerance_amount       NUMERIC(12,2) NOT NULL DEFAULT 50.00,
    cash_max_in_session         NUMERIC(12,2),
    ncf_alert_threshold         INT NOT NULL DEFAULT 100,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.tenant_settings.tax_config IS 'Config fiscal: RNC, certificado e-CF, PSE. Cifrado a nivel aplicación.';
COMMENT ON COLUMN public.tenant_settings.business_hours IS 'Horarios por día para cálculo de SLA de Operations.';

-- --------------------------------------------------------------------------
-- TABLA: users
-- Usuarios globales. Un usuario puede pertenecer a varios tenants.
-- --------------------------------------------------------------------------
CREATE TABLE public.users (
    user_id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   CITEXT NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20),
    status                  user_status NOT NULL DEFAULT 'pending',
    mfa_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret              TEXT,
    last_login_at           TIMESTAMPTZ,
    failed_login_attempts   INT NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_status ON public.users(status) WHERE status = 'active';

COMMENT ON COLUMN public.users.password_hash IS 'Argon2id hash. Ver ADR-011.';
COMMENT ON COLUMN public.users.mfa_secret IS 'TOTP secret cifrado a nivel aplicación.';

-- --------------------------------------------------------------------------
-- TABLA: tenant_memberships
-- Relación N-a-M entre usuarios y tenants, con roles asignados
-- --------------------------------------------------------------------------
CREATE TABLE public.tenant_memberships (
    membership_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    tenant_id        UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    role_ids         UUID[] NOT NULL DEFAULT '{}',
    branch_ids       UUID[] NOT NULL DEFAULT '{}',
    status           membership_status NOT NULL DEFAULT 'invited',
    invited_by       UUID REFERENCES public.users(user_id),
    invited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_memberships_user ON public.tenant_memberships(user_id) WHERE status = 'active';
CREATE INDEX idx_memberships_tenant ON public.tenant_memberships(tenant_id) WHERE status = 'active';

COMMENT ON COLUMN public.tenant_memberships.branch_ids IS 'Sucursales autorizadas. Vacío = todas las del tenant.';

-- --------------------------------------------------------------------------
-- TABLA: permission_catalog
-- Catálogo global de permisos declarados por el núcleo y los verticales
-- --------------------------------------------------------------------------
CREATE TABLE public.permission_catalog (
    code            VARCHAR(100) PRIMARY KEY,
    description     TEXT NOT NULL,
    category        VARCHAR(50) NOT NULL,
    owner           VARCHAR(50) NOT NULL DEFAULT 'core',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_permission_code CHECK (code ~ '^[a-z_]+:[a-z_]+(:[a-z_]+)?$')
);

COMMENT ON COLUMN public.permission_catalog.owner IS 'core, laundry, u otro vertical que declara el permiso.';

-- Seed de permisos del núcleo
INSERT INTO public.permission_catalog (code, description, category, owner) VALUES
    ('admin:manage_users',          'Gestionar usuarios del tenant',       'admin',    'core'),
    ('admin:manage_roles',          'Crear y editar roles',                 'admin',    'core'),
    ('admin:manage_settings',       'Configurar tenant',                    'admin',    'core'),
    ('admin:manage_branches',       'Gestionar sucursales',                 'admin',    'core'),
    ('orders:create',               'Crear órdenes',                        'orders',   'core'),
    ('orders:view',                 'Ver órdenes',                          'orders',   'core'),
    ('orders:update',               'Modificar órdenes',                    'orders',   'core'),
    ('orders:cancel',               'Cancelar órdenes',                     'orders',   'core'),
    ('orders:apply_discount',       'Aplicar descuentos',                   'orders',   'core'),
    ('customers:create',            'Crear clientes',                       'customers','core'),
    ('customers:view',              'Ver clientes',                         'customers','core'),
    ('customers:update',            'Editar clientes',                      'customers','core'),
    ('customers:block',             'Bloquear clientes',                    'customers','core'),
    ('catalog:manage_services',     'Gestionar servicios y productos',      'catalog',  'core'),
    ('catalog:manage_prices',       'Gestionar precios y tarifas',          'catalog',  'core'),
    ('billing:issue_invoice',       'Emitir facturas',                      'billing',  'core'),
    ('billing:issue_credit_note',   'Emitir notas de crédito',              'billing',  'core'),
    ('billing:void',                'Anular facturas',                      'billing',  'core'),
    ('billing:view_reports',        'Ver reportes fiscales',                'billing',  'core'),
    ('cash:open_session',           'Abrir caja',                           'cash',     'core'),
    ('cash:close_session',          'Cerrar caja',                          'cash',     'core'),
    ('cash:approve_difference',     'Aprobar descuadres',                   'cash',     'core'),
    ('cash:force_close_session',    'Cerrar caja forzadamente',             'cash',     'core'),
    ('reports:view_operational',    'Ver reportes operacionales',           'reports',  'core'),
    ('reports:view_financial',      'Ver reportes financieros',             'reports',  'core'),
    ('audit:view',                  'Consultar log de auditoría',           'audit',    'core'),
    ('audit:export',                'Exportar log de auditoría',            'audit',    'core'),
    ('laundry:operations:view',     'Ver dashboard de producción',          'laundry',  'laundry'),
    ('laundry:operations:advance_stage', 'Avanzar etapas de producción',    'laundry',  'laundry'),
    ('laundry:operations:quality_check', 'Aprobar control de calidad',      'laundry',  'laundry');

-- --------------------------------------------------------------------------
-- TABLA: refresh_tokens
-- Tokens de refresh para JWT (ver ADR-011)
-- --------------------------------------------------------------------------
CREATE TABLE public.refresh_tokens (
    token_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    device_info     JSONB,
    ip_address      INET,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user_tenant ON public.refresh_tokens(user_id, tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- --------------------------------------------------------------------------
-- TABLA: invitations
-- Invitaciones pendientes de usuarios a tenants
-- --------------------------------------------------------------------------
CREATE TABLE public.invitations (
    invitation_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    email            CITEXT NOT NULL,
    role_ids         UUID[] NOT NULL DEFAULT '{}',
    branch_ids       UUID[] NOT NULL DEFAULT '{}',
    token_hash       TEXT NOT NULL UNIQUE,
    invited_by       UUID REFERENCES public.users(user_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL,
    accepted_at      TIMESTAMPTZ
);

CREATE INDEX idx_invitations_email ON public.invitations(email) WHERE accepted_at IS NULL;

-- --------------------------------------------------------------------------
-- TABLA: password_reset_tokens
-- --------------------------------------------------------------------------
CREATE TABLE public.password_reset_tokens (
    token_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ
);

CREATE INDEX idx_pwd_reset_user ON public.password_reset_tokens(user_id) WHERE used_at IS NULL;

-- --------------------------------------------------------------------------
-- TABLA: audit_global_security_events
-- Eventos de seguridad críticos replicados al schema global (ver ADR-012)
-- --------------------------------------------------------------------------
CREATE TABLE public.audit_global_security_events (
    event_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES public.tenants(tenant_id),
    event_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    actor_id        VARCHAR(100),
    actor_ip        INET,
    risk_score      INT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID
);

CREATE INDEX idx_sec_events_tenant_time ON public.audit_global_security_events(tenant_id, detected_at DESC);
CREATE INDEX idx_sec_events_unresolved ON public.audit_global_security_events(detected_at DESC) WHERE resolved_at IS NULL;

-- --------------------------------------------------------------------------
-- TABLA: schema_migrations
-- Control de migraciones aplicadas por schema
-- --------------------------------------------------------------------------
CREATE TABLE public.schema_migrations (
    migration_id     VARCHAR(100) NOT NULL,
    schema_name      VARCHAR(63) NOT NULL,
    applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum         VARCHAR(64) NOT NULL,

    PRIMARY KEY (migration_id, schema_name)
);

-- --------------------------------------------------------------------------
-- FUNCIÓN: trigger de updated_at
-- Reutilizable en todas las tablas con updated_at
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tenant_settings_updated BEFORE UPDATE ON public.tenant_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON public.tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
