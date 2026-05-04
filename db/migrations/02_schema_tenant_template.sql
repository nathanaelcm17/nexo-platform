-- ==========================================================================
-- NexoLaundry - DDL Schema de Tenant (template)
-- Fase 0 y Fase 1
-- PostgreSQL 16+
-- ==========================================================================
-- Este script se ejecuta por cada tenant creando su propio schema aislado.
-- Reemplazar {{SCHEMA}} con el nombre real del schema (ej. tenant_acme)
-- antes de ejecutar, o usar el provisioner del platform-runtime.
-- ==========================================================================

CREATE SCHEMA IF NOT EXISTS {{SCHEMA}};
SET search_path TO {{SCHEMA}}, public;

-- Extensión necesaria para búsqueda fuzzy en clientes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================================================
-- TIPOS ENUM DEL TENANT
-- ==========================================================================
CREATE TYPE customer_type AS ENUM ('individual', 'business');
CREATE TYPE customer_doc_type AS ENUM ('cedula', 'rnc', 'passport');
CREATE TYPE customer_status AS ENUM ('active', 'inactive', 'blocked');

CREATE TYPE catalog_item_type AS ENUM ('service', 'product', 'package');
CREATE TYPE unit_of_measure AS ENUM ('piece', 'kg', 'dozen', 'hour', 'unit');

CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'in_fulfillment', 'ready', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE order_priority AS ENUM ('normal', 'express', 'same_day');

CREATE TYPE work_order_status AS ENUM ('pending', 'in_progress', 'on_hold', 'completed', 'cancelled');

CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled', 'credit_noted');
CREATE TYPE ncf_type AS ENUM ('B01', 'B02', 'B04', 'B14', 'B15');
CREATE TYPE payment_method AS ENUM ('cash', 'card_manual', 'transfer', 'credit');

CREATE TYPE cash_session_status AS ENUM ('open', 'closing', 'closed', 'force_closed');
CREATE TYPE cash_movement_type AS ENUM ('sale', 'refund', 'cash_in', 'cash_out', 'drop', 'opening_float', 'adjustment');

-- ==========================================================================
-- IDENTITY & ACCESS (a nivel tenant)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.roles (
    role_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100) NOT NULL,
    description      TEXT,
    permissions      TEXT[] NOT NULL DEFAULT '{}',
    is_system_role   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(name)
);

CREATE TABLE {{SCHEMA}}.branches (
    branch_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100) NOT NULL,
    address          TEXT,
    phone            VARCHAR(20),
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branches_active ON {{SCHEMA}}.branches(active) WHERE active = TRUE;

-- ==========================================================================
-- CUSTOMERS
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.customers (
    customer_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code       VARCHAR(20) NOT NULL UNIQUE,
    customer_type       customer_type NOT NULL DEFAULT 'individual',
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    business_name       VARCHAR(200),
    document_type       customer_doc_type,
    document_number     VARCHAR(20),
    phone               VARCHAR(20),
    email               CITEXT,
    tags                TEXT[] NOT NULL DEFAULT '{}',
    credit_limit        NUMERIC(12,2) NOT NULL DEFAULT 0,
    consent_whatsapp    BOOLEAN NOT NULL DEFAULT FALSE,
    consent_whatsapp_at TIMESTAMPTZ,
    status              customer_status NOT NULL DEFAULT 'active',
    notes               TEXT,
    extensions          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_customer_name CHECK (
        (customer_type = 'individual' AND first_name IS NOT NULL)
        OR (customer_type = 'business' AND business_name IS NOT NULL)
    ),
    UNIQUE(document_type, document_number)
);

CREATE INDEX idx_customers_phone ON {{SCHEMA}}.customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_email ON {{SCHEMA}}.customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_document ON {{SCHEMA}}.customers(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX idx_customers_status ON {{SCHEMA}}.customers(status) WHERE status = 'active';
CREATE INDEX idx_customers_name_trgm ON {{SCHEMA}}.customers USING GIN ((coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(business_name,'')) gin_trgm_ops);

CREATE TABLE {{SCHEMA}}.customer_addresses (
    address_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id      UUID NOT NULL REFERENCES {{SCHEMA}}.customers(customer_id) ON DELETE CASCADE,
    label            VARCHAR(50),
    street           TEXT NOT NULL,
    sector           VARCHAR(100),
    city             VARCHAR(100),
    province         VARCHAR(100),
    reference        TEXT,
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON {{SCHEMA}}.customer_addresses(customer_id);

-- ==========================================================================
-- CATALOG
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.catalog_items (
    item_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                 VARCHAR(30) NOT NULL UNIQUE,
    name                 VARCHAR(200) NOT NULL,
    description          TEXT,
    category             VARCHAR(100),
    item_type            catalog_item_type NOT NULL DEFAULT 'service',
    pricing_model        JSONB NOT NULL,
    unit_of_measure      unit_of_measure NOT NULL DEFAULT 'piece',
    tax_rate             NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    tax_included         BOOLEAN NOT NULL DEFAULT FALSE,
    fulfillment_hints    JSONB NOT NULL DEFAULT '{}'::jsonb,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    available_branches   UUID[],
    extensions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_active ON {{SCHEMA}}.catalog_items(active) WHERE active = TRUE;
CREATE INDEX idx_catalog_category ON {{SCHEMA}}.catalog_items(category);

COMMENT ON COLUMN {{SCHEMA}}.catalog_items.pricing_model IS 'JSON: {kind:"fixed",price:100} | {kind:"per_unit",unitPrice:50} | etc.';

-- ==========================================================================
-- ORDERS (núcleo genérico)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.orders (
    order_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number         VARCHAR(30) NOT NULL UNIQUE,
    customer_id          UUID NOT NULL REFERENCES {{SCHEMA}}.customers(customer_id),
    branch_id            UUID NOT NULL REFERENCES {{SCHEMA}}.branches(branch_id),
    received_by          UUID NOT NULL,
    status               order_status NOT NULL DEFAULT 'draft',
    priority             order_priority NOT NULL DEFAULT 'normal',
    fulfillment_type     VARCHAR(50),
    fulfillment_ref      UUID,
    fulfillment_status   VARCHAR(50),
    subtotal             NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount             NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_total            NUMERIC(12,2) NOT NULL DEFAULT 0,
    total                NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status       payment_status NOT NULL DEFAULT 'unpaid',
    paid_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes                TEXT,
    cancelled_reason     TEXT,
    promised_at          TIMESTAMPTZ,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at         TIMESTAMPTZ,
    ready_at             TIMESTAMPTZ,
    delivered_at         TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    extensions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_totals CHECK (total = subtotal - discount + tax_total),
    CONSTRAINT chk_paid_le_total CHECK (paid_amount <= total + 0.01)
);

CREATE INDEX idx_orders_customer ON {{SCHEMA}}.orders(customer_id);
CREATE INDEX idx_orders_branch_status ON {{SCHEMA}}.orders(branch_id, status);
CREATE INDEX idx_orders_status_promised ON {{SCHEMA}}.orders(status, promised_at) WHERE status IN ('confirmed','in_fulfillment','ready');
CREATE INDEX idx_orders_received_at ON {{SCHEMA}}.orders(received_at DESC);

CREATE TABLE {{SCHEMA}}.order_lines (
    line_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id         UUID NOT NULL REFERENCES {{SCHEMA}}.orders(order_id) ON DELETE CASCADE,
    catalog_item_id  UUID NOT NULL REFERENCES {{SCHEMA}}.catalog_items(item_id),
    description      VARCHAR(300) NOT NULL,
    quantity         NUMERIC(10,3) NOT NULL,
    unit_of_measure  unit_of_measure NOT NULL,
    unit_price       NUMERIC(12,2) NOT NULL,
    discount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate         NUMERIC(5,2) NOT NULL,
    line_total       NUMERIC(12,2) NOT NULL,
    extensions       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_lines_order ON {{SCHEMA}}.order_lines(order_id);

-- Secuencia para order_number correlativo
CREATE SEQUENCE {{SCHEMA}}.seq_order_number START 1;

-- ==========================================================================
-- OPERATIONS (vertical laundry)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.stages (
    stage_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(100) NOT NULL,
    "order"                 INT NOT NULL,
    estimated_duration_min  INT,
    requires_quality_check  BOOLEAN NOT NULL DEFAULT FALSE,
    is_initial              BOOLEAN NOT NULL DEFAULT FALSE,
    is_final                BOOLEAN NOT NULL DEFAULT FALSE,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE("order")
);

CREATE TABLE {{SCHEMA}}.work_orders (
    work_order_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL UNIQUE REFERENCES {{SCHEMA}}.orders(order_id),
    branch_id           UUID NOT NULL REFERENCES {{SCHEMA}}.branches(branch_id),
    priority            order_priority NOT NULL DEFAULT 'normal',
    status              work_order_status NOT NULL DEFAULT 'pending',
    sla_deadline        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_orders_status ON {{SCHEMA}}.work_orders(status) WHERE status IN ('pending','in_progress','on_hold');
CREATE INDEX idx_work_orders_sla ON {{SCHEMA}}.work_orders(sla_deadline) WHERE status IN ('pending','in_progress');

CREATE TABLE {{SCHEMA}}.production_items (
    production_item_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id        UUID NOT NULL REFERENCES {{SCHEMA}}.work_orders(work_order_id) ON DELETE CASCADE,
    order_line_id        UUID REFERENCES {{SCHEMA}}.order_lines(line_id),
    barcode              VARCHAR(50) UNIQUE,
    description          VARCHAR(200),
    current_stage_id     UUID REFERENCES {{SCHEMA}}.stages(stage_id),
    current_location     VARCHAR(100),
    photos               TEXT[],
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prod_items_work_order ON {{SCHEMA}}.production_items(work_order_id);
CREATE INDEX idx_prod_items_stage ON {{SCHEMA}}.production_items(current_stage_id);

CREATE TABLE {{SCHEMA}}.stage_transitions (
    transition_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_item_id   UUID NOT NULL REFERENCES {{SCHEMA}}.production_items(production_item_id),
    from_stage_id        UUID REFERENCES {{SCHEMA}}.stages(stage_id),
    to_stage_id          UUID NOT NULL REFERENCES {{SCHEMA}}.stages(stage_id),
    performed_by         UUID NOT NULL,
    rejected             BOOLEAN NOT NULL DEFAULT FALSE,
    notes                TEXT,
    occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_item_time ON {{SCHEMA}}.stage_transitions(production_item_id, occurred_at DESC);

-- ==========================================================================
-- BILLING
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.ncf_sequences (
    sequence_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id           UUID REFERENCES {{SCHEMA}}.branches(branch_id),
    ncf_type            ncf_type NOT NULL,
    prefix              VARCHAR(10) NOT NULL,
    number_from         BIGINT NOT NULL,
    number_to           BIGINT NOT NULL,
    current_number      BIGINT NOT NULL,
    expiration_date     DATE,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ncf_range CHECK (current_number BETWEEN number_from AND number_to),
    CONSTRAINT chk_ncf_order CHECK (number_from <= number_to)
);

CREATE INDEX idx_ncf_active ON {{SCHEMA}}.ncf_sequences(ncf_type, branch_id) WHERE active = TRUE;

CREATE TABLE {{SCHEMA}}.invoices (
    invoice_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,
    order_id            UUID REFERENCES {{SCHEMA}}.orders(order_id),
    customer_id         UUID NOT NULL REFERENCES {{SCHEMA}}.customers(customer_id),
    branch_id           UUID NOT NULL REFERENCES {{SCHEMA}}.branches(branch_id),
    ncf                 VARCHAR(20) NOT NULL UNIQUE,
    ncf_type            ncf_type NOT NULL,
    issue_date          DATE NOT NULL,
    due_date            DATE,
    currency            CHAR(3) NOT NULL DEFAULT 'DOP',
    subtotal            NUMERIC(12,2) NOT NULL,
    itbis               NUMERIC(12,2) NOT NULL,
    total_exempt        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL,
    status              invoice_status NOT NULL DEFAULT 'issued',
    issued_by           UUID NOT NULL,
    cancelled_at        TIMESTAMPTZ,
    cancelled_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer ON {{SCHEMA}}.invoices(customer_id);
CREATE INDEX idx_invoices_order ON {{SCHEMA}}.invoices(order_id);
CREATE INDEX idx_invoices_issue_date ON {{SCHEMA}}.invoices(issue_date DESC);
CREATE INDEX idx_invoices_status ON {{SCHEMA}}.invoices(status);

CREATE TABLE {{SCHEMA}}.invoice_lines (
    line_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id       UUID NOT NULL REFERENCES {{SCHEMA}}.invoices(invoice_id) ON DELETE CASCADE,
    description      VARCHAR(300) NOT NULL,
    quantity         NUMERIC(10,3) NOT NULL,
    unit_price       NUMERIC(12,2) NOT NULL,
    discount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate         NUMERIC(5,2) NOT NULL,
    line_total       NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_invoice_lines ON {{SCHEMA}}.invoice_lines(invoice_id);

CREATE TABLE {{SCHEMA}}.payments (
    payment_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id       UUID NOT NULL REFERENCES {{SCHEMA}}.invoices(invoice_id),
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    method           payment_method NOT NULL,
    reference        VARCHAR(100),
    received_by      UUID NOT NULL,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes            TEXT
);

CREATE INDEX idx_payments_invoice ON {{SCHEMA}}.payments(invoice_id);
CREATE INDEX idx_payments_date ON {{SCHEMA}}.payments(received_at DESC);

CREATE TABLE {{SCHEMA}}.credit_notes (
    credit_note_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id       UUID NOT NULL REFERENCES {{SCHEMA}}.invoices(invoice_id),
    ncf              VARCHAR(20) NOT NULL UNIQUE,
    amount           NUMERIC(12,2) NOT NULL,
    reason           TEXT NOT NULL,
    issued_by        UUID NOT NULL,
    issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================================
-- POS / CASH SESSIONS
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.terminals (
    terminal_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id        UUID NOT NULL REFERENCES {{SCHEMA}}.branches(branch_id),
    name             VARCHAR(100) NOT NULL,
    device_fingerprint VARCHAR(200),
    last_seen_at     TIMESTAMPTZ,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE {{SCHEMA}}.cash_sessions (
    session_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id             UUID NOT NULL REFERENCES {{SCHEMA}}.terminals(terminal_id),
    branch_id               UUID NOT NULL REFERENCES {{SCHEMA}}.branches(branch_id),
    cashier_id              UUID NOT NULL,
    status                  cash_session_status NOT NULL DEFAULT 'open',
    opened_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opening_balance         NUMERIC(12,2) NOT NULL,
    opening_denominations   JSONB NOT NULL DEFAULT '{}'::jsonb,
    closed_at               TIMESTAMPTZ,
    closing_balance         NUMERIC(12,2),
    closing_denominations   JSONB,
    expected_cash           NUMERIC(12,2),
    difference              NUMERIC(12,2),
    difference_reason       TEXT,
    closed_by               UUID,
    supervisor_approved_by  UUID
);

CREATE UNIQUE INDEX idx_cash_sessions_open_per_terminal
    ON {{SCHEMA}}.cash_sessions(terminal_id) WHERE status = 'open';
CREATE INDEX idx_cash_sessions_cashier ON {{SCHEMA}}.cash_sessions(cashier_id, opened_at DESC);
CREATE INDEX idx_cash_sessions_branch_date ON {{SCHEMA}}.cash_sessions(branch_id, opened_at DESC);

CREATE TABLE {{SCHEMA}}.cash_movements (
    movement_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id       UUID NOT NULL REFERENCES {{SCHEMA}}.cash_sessions(session_id),
    type             cash_movement_type NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    method           payment_method,
    related_invoice_id UUID REFERENCES {{SCHEMA}}.invoices(invoice_id),
    related_order_id UUID REFERENCES {{SCHEMA}}.orders(order_id),
    description      TEXT,
    performed_by     UUID NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_movements_session ON {{SCHEMA}}.cash_movements(session_id, occurred_at);

-- ==========================================================================
-- NOTIFICATIONS (internas en Fase 1)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.notification_templates (
    template_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code             VARCHAR(50) NOT NULL,
    channel          VARCHAR(20) NOT NULL,
    language         VARCHAR(10) NOT NULL DEFAULT 'es-DO',
    subject          VARCHAR(200),
    body             TEXT NOT NULL,
    category         VARCHAR(30) NOT NULL,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(code, channel, language)
);

CREATE TABLE {{SCHEMA}}.notifications (
    notification_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_user_id UUID,
    recipient_customer_id UUID REFERENCES {{SCHEMA}}.customers(customer_id),
    channel          VARCHAR(20) NOT NULL,
    template_code    VARCHAR(50),
    subject          VARCHAR(200),
    body             TEXT NOT NULL,
    category         VARCHAR(30) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient_unread ON {{SCHEMA}}.notifications(recipient_user_id, created_at DESC)
    WHERE read_at IS NULL;

-- ==========================================================================
-- AUDIT (append-only con hash chain)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.audit_log_entries (
    entry_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category         VARCHAR(30) NOT NULL,
    severity         VARCHAR(20) NOT NULL DEFAULT 'info',
    actor_type       VARCHAR(30) NOT NULL,
    actor_id         VARCHAR(100),
    actor_ip         INET,
    actor_user_agent TEXT,
    branch_id        UUID,
    action           VARCHAR(100) NOT NULL,
    resource_type    VARCHAR(50),
    resource_id      VARCHAR(100),
    summary          TEXT NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_state   JSONB,
    new_state        JSONB,
    correlation_id   UUID,
    hash             CHAR(64) NOT NULL,
    previous_hash    CHAR(64)
);

CREATE INDEX idx_audit_ts ON {{SCHEMA}}.audit_log_entries(ts DESC);
CREATE INDEX idx_audit_resource ON {{SCHEMA}}.audit_log_entries(resource_type, resource_id, ts DESC);
CREATE INDEX idx_audit_actor ON {{SCHEMA}}.audit_log_entries(actor_id, ts DESC);
CREATE INDEX idx_audit_category ON {{SCHEMA}}.audit_log_entries(category, ts DESC);

-- Event Store (eventos de dominio, también inmutable)
CREATE TABLE {{SCHEMA}}.domain_events (
    event_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_name       VARCHAR(100) NOT NULL,
    event_version    VARCHAR(20) NOT NULL,
    aggregate_type   VARCHAR(50) NOT NULL,
    aggregate_id     VARCHAR(100) NOT NULL,
    aggregate_version INT,
    payload          JSONB NOT NULL,
    correlation_id   UUID,
    causation_id     UUID,
    published_by     VARCHAR(100) NOT NULL
);

CREATE INDEX idx_events_aggregate ON {{SCHEMA}}.domain_events(aggregate_type, aggregate_id, ts);
CREATE INDEX idx_events_name_ts ON {{SCHEMA}}.domain_events(event_name, ts DESC);
CREATE INDEX idx_events_correlation ON {{SCHEMA}}.domain_events(correlation_id) WHERE correlation_id IS NOT NULL;

-- ==========================================================================
-- REPORTING (read models)
-- ==========================================================================

CREATE TABLE {{SCHEMA}}.rm_daily_sales_summary (
    date                DATE NOT NULL,
    branch_id           UUID NOT NULL,
    total_orders        INT NOT NULL DEFAULT 0,
    total_revenue       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_itbis         NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_discount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    cash_revenue        NUMERIC(14,2) NOT NULL DEFAULT 0,
    card_revenue        NUMERIC(14,2) NOT NULL DEFAULT 0,
    transfer_revenue    NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_revenue      NUMERIC(14,2) NOT NULL DEFAULT 0,
    new_customers       INT NOT NULL DEFAULT 0,
    returning_customers INT NOT NULL DEFAULT 0,
    cancelled_orders    INT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, branch_id)
);

CREATE TABLE {{SCHEMA}}.rm_customer_360 (
    customer_id          UUID PRIMARY KEY REFERENCES {{SCHEMA}}.customers(customer_id) ON DELETE CASCADE,
    total_orders         INT NOT NULL DEFAULT 0,
    lifetime_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
    average_ticket       NUMERIC(12,2) NOT NULL DEFAULT 0,
    first_order_at       TIMESTAMPTZ,
    last_order_at        TIMESTAMPTZ,
    current_balance      NUMERIC(12,2) NOT NULL DEFAULT 0,
    segment              VARCHAR(20),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_360_segment ON {{SCHEMA}}.rm_customer_360(segment);
CREATE INDEX idx_customer_360_ltv ON {{SCHEMA}}.rm_customer_360(lifetime_value DESC);

-- Tracking de eventos procesados por proyecciones (idempotencia)
CREATE TABLE {{SCHEMA}}.rm_processed_events (
    projection_name  VARCHAR(100) NOT NULL,
    event_id         UUID NOT NULL,
    processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (projection_name, event_id)
);

-- ==========================================================================
-- TRIGGERS updated_at
-- ==========================================================================

CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON {{SCHEMA}}.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON {{SCHEMA}}.branches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON {{SCHEMA}}.customers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_catalog_updated BEFORE UPDATE ON {{SCHEMA}}.catalog_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON {{SCHEMA}}.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_work_orders_updated BEFORE UPDATE ON {{SCHEMA}}.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_prod_items_updated BEFORE UPDATE ON {{SCHEMA}}.production_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_notif_tpl_updated BEFORE UPDATE ON {{SCHEMA}}.notification_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================================
-- PROTECCIÓN: audit_log_entries y domain_events son append-only
-- Revocar UPDATE y DELETE al usuario de aplicación (ADR-012)
-- Se ejecuta desde el provisioner con el usuario correcto:
-- REVOKE UPDATE, DELETE ON {{SCHEMA}}.audit_log_entries FROM app_user;
-- REVOKE UPDATE, DELETE ON {{SCHEMA}}.domain_events FROM app_user;
-- ==========================================================================

-- ==========================================================================
-- SEEDS DEL TENANT
-- ==========================================================================

-- Roles del sistema (cada tenant nuevo los recibe)
INSERT INTO {{SCHEMA}}.roles (name, description, permissions, is_system_role) VALUES
    ('Dueño',   'Acceso total al tenant',
        ARRAY['admin:manage_users','admin:manage_roles','admin:manage_settings','admin:manage_branches',
              'orders:create','orders:view','orders:update','orders:cancel','orders:apply_discount',
              'customers:create','customers:view','customers:update','customers:block',
              'catalog:manage_services','catalog:manage_prices',
              'billing:issue_invoice','billing:issue_credit_note','billing:void','billing:view_reports',
              'cash:open_session','cash:close_session','cash:approve_difference','cash:force_close_session',
              'reports:view_operational','reports:view_financial',
              'audit:view','audit:export',
              'laundry:operations:view','laundry:operations:advance_stage','laundry:operations:quality_check'],
        TRUE),
    ('Manager', 'Gestión operativa y reportes',
        ARRAY['orders:create','orders:view','orders:update','orders:cancel','orders:apply_discount',
              'customers:create','customers:view','customers:update',
              'catalog:manage_services','catalog:manage_prices',
              'billing:issue_invoice','billing:view_reports',
              'cash:open_session','cash:close_session','cash:approve_difference',
              'reports:view_operational','reports:view_financial',
              'laundry:operations:view','laundry:operations:advance_stage','laundry:operations:quality_check'],
        TRUE),
    ('Cajero',  'Recepción y cobro en mostrador',
        ARRAY['orders:create','orders:view','orders:update',
              'customers:create','customers:view','customers:update',
              'billing:issue_invoice',
              'cash:open_session','cash:close_session'],
        TRUE),
    ('Operario','Personal de planta',
        ARRAY['orders:view',
              'laundry:operations:view','laundry:operations:advance_stage'],
        TRUE);

-- Etapas estándar de lavandería
INSERT INTO {{SCHEMA}}.stages (name, "order", estimated_duration_min, requires_quality_check, is_initial, is_final) VALUES
    ('Recepción',    1, 5,    FALSE, TRUE,  FALSE),
    ('Marcado',      2, 10,   FALSE, FALSE, FALSE),
    ('Lavado',       3, 60,   FALSE, FALSE, FALSE),
    ('Secado',       4, 45,   FALSE, FALSE, FALSE),
    ('Planchado',    5, 30,   FALSE, FALSE, FALSE),
    ('Control QC',   6, 10,   TRUE,  FALSE, FALSE),
    ('Empaque',      7, 10,   FALSE, FALSE, FALSE),
    ('Listo',        8, NULL, FALSE, FALSE, TRUE);

-- Plantillas base de notificaciones internas
INSERT INTO {{SCHEMA}}.notification_templates (code, channel, subject, body, category) VALUES
    ('ORDER_READY',     'inapp', 'Orden lista para retiro',   'La orden {{orderNumber}} del cliente {{customerName}} está lista.', 'transactional'),
    ('INVOICE_ISSUED',  'inapp', 'Factura emitida',            'Factura {{ncf}} emitida por RD$ {{total}}.', 'transactional'),
    ('CASH_DIFFERENCE', 'inapp', 'Descuadre detectado',        'Caja {{terminalName}} cerró con diferencia de RD$ {{difference}}.', 'operational');

-- Extensión GIN necesaria para búsqueda trgm de clientes (ya declarada al inicio).
