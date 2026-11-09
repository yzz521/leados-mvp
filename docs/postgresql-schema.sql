-- LeadOS future PostgreSQL reference schema
-- This file is a design reference only. The runnable MVP currently uses data/leados.json.
-- Execute only after reviewing tenant isolation, PII encryption, retention and migration strategy.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenant (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(160) NOT NULL,
    status          VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
    region_code     VARCHAR(12),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(320) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(120) NOT NULL,
    status          VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_member (
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    user_id         UUID NOT NULL REFERENCES app_user(id),
    role_code       VARCHAR(32) NOT NULL CHECK (role_code IN ('OWNER','ADMIN','SALES','ANALYST','READ_ONLY')),
    status          VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
    joined_at       TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE organization (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    market_type     VARCHAR(12) NOT NULL CHECK (market_type IN ('LOCAL','EXPORT')),
    legal_name      VARCHAR(240) NOT NULL,
    website         TEXT,
    country_code    CHAR(2),
    city            VARCHAR(120),
    industry        VARCHAR(160),
    source_summary  VARCHAR(240),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, market_type, legal_name)
);
CREATE INDEX idx_organization_tenant_name ON organization(tenant_id, legal_name);

CREATE TABLE person (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    full_name       VARCHAR(160),
    email_ciphertext BYTEA,
    email_hash      BYTEA,
    phone_ciphertext BYTEA,
    phone_hash      BYTEA,
    title           VARCHAR(160),
    country_code    CHAR(2),
    contact_status  VARCHAR(24) NOT NULL DEFAULT 'UNCONFIRMED'
                    CHECK (contact_status IN ('UNCONFIRMED','AUTHORIZED','OPTED_OUT','NOT_APPLICABLE')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_tenant_email_hash ON person(tenant_id, email_hash);
CREATE INDEX idx_person_tenant_phone_hash ON person(tenant_id, phone_hash);

CREATE TABLE person_organization_relation (
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    person_id       UUID NOT NULL REFERENCES person(id),
    organization_id UUID NOT NULL REFERENCES organization(id),
    relation_type   VARCHAR(32) NOT NULL DEFAULT 'EMPLOYEE',
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, person_id, organization_id)
);

CREATE TABLE lead (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenant(id),
    market_type         VARCHAR(12) NOT NULL CHECK (market_type IN ('LOCAL','EXPORT')),
    subject_type        VARCHAR(12) NOT NULL CHECK (subject_type IN ('COMPANY','PERSON')),
    organization_id     UUID REFERENCES organization(id),
    person_id           UUID REFERENCES person(id),
    status              VARCHAR(24) NOT NULL DEFAULT 'NEW'
                        CHECK (status IN ('NEW','QUALIFIED','CONTACTED','OPPORTUNITY','WON','LOST')),
    product_interest    TEXT,
    requirement_summary TEXT,
    budget_text         VARCHAR(160),
    budget_amount       NUMERIC(18,2),
    budget_currency     CHAR(3),
    decision_timeline   VARCHAR(160),
    score               SMALLINT CHECK (score BETWEEN 0 AND 100),
    score_level         VARCHAR(12) CHECK (score_level IN ('HIGH','MEDIUM','LOW')),
    score_reason        TEXT,
    owner_user_id       UUID REFERENCES app_user(id),
    source_id           UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_lead_tenant_market_status ON lead(tenant_id, market_type, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_tenant_owner ON lead(tenant_id, owner_user_id, status) WHERE deleted_at IS NULL;

CREATE TABLE lead_source_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenant(id),
    lead_id             UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
    source_type         VARCHAR(40) NOT NULL,
    source_name         VARCHAR(200),
    source_url          TEXT,
    provider_record_id  VARCHAR(240),
    collected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    license_reference   TEXT,
    collection_method   VARCHAR(40),
    verification_status VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED'
                        CHECK (verification_status IN ('UNVERIFIED','VERIFIED','INVALID','EXPIRED')),
    last_verified_at    TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_lead_source_tenant_lead ON lead_source_record(tenant_id, lead_id, collected_at DESC);

CREATE TABLE consent_record (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    subject_type    VARCHAR(16) NOT NULL CHECK (subject_type IN ('PERSON','ORGANIZATION')),
    subject_id      UUID NOT NULL,
    purpose_code    VARCHAR(80) NOT NULL,
    channel_code    VARCHAR(40) NOT NULL,
    legal_basis     VARCHAR(40) NOT NULL,
    status          VARCHAR(24) NOT NULL CHECK (status IN ('GRANTED','REQUESTED','WITHDRAWN','OBJECTED','EXPIRED')),
    evidence_ref    TEXT,
    notice_version  VARCHAR(80),
    granted_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    country_code    CHAR(2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_tenant_subject ON consent_record(tenant_id, subject_type, subject_id, purpose_code, channel_code);

CREATE TABLE suppression_record (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    subject_type    VARCHAR(16) NOT NULL CHECK (subject_type IN ('PERSON','ORGANIZATION','ADDRESS')),
    subject_hash    BYTEA NOT NULL,
    channel_code    VARCHAR(40) NOT NULL,
    reason_code     VARCHAR(40) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, subject_hash, channel_code)
);

CREATE TABLE opportunity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenant(id),
    lead_id             UUID NOT NULL REFERENCES lead(id),
    name                VARCHAR(240) NOT NULL,
    stage               VARCHAR(32) NOT NULL,
    amount               NUMERIC(18,2),
    currency             CHAR(3),
    expected_close_date  DATE,
    result_reason        TEXT,
    owner_user_id        UUID REFERENCES app_user(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opportunity_tenant_stage ON opportunity(tenant_id, stage, expected_close_date);

CREATE TABLE interaction (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    lead_id         UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
    interaction_type VARCHAR(24) NOT NULL,
    direction       VARCHAR(12),
    subject         VARCHAR(240),
    content         TEXT,
    channel_code    VARCHAR(40),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES app_user(id),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_interaction_tenant_lead_time ON interaction(tenant_id, lead_id, occurred_at DESC);

CREATE TABLE sales_task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    lead_id         UUID REFERENCES lead(id) ON DELETE SET NULL,
    title           VARCHAR(240) NOT NULL,
    description     TEXT,
    priority        VARCHAR(12) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
    due_at          TIMESTAMPTZ,
    assigned_to     UUID REFERENCES app_user(id),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_task_tenant_assignee_due ON sales_task(tenant_id, assigned_to, due_at) WHERE status <> 'DONE';

CREATE TABLE workflow_definition (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    name            VARCHAR(160) NOT NULL,
    market_type     VARCHAR(12) CHECK (market_type IN ('LOCAL','EXPORT')),
    trigger_type    VARCHAR(60) NOT NULL,
    definition      JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','DISABLED')),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_run (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    workflow_id     UUID NOT NULL REFERENCES workflow_definition(id),
    trigger_ref     VARCHAR(240),
    status          VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
    input_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_run_tenant_status ON workflow_run(tenant_id, status, created_at DESC);

CREATE TABLE ai_execution (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    feature_code    VARCHAR(60) NOT NULL,
    provider        VARCHAR(80),
    model_name      VARCHAR(120),
    prompt_version  VARCHAR(80),
    input_ref       VARCHAR(240),
    output_data     JSONB,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cost_amount     NUMERIC(18,8),
    latency_ms      INTEGER,
    status          VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_execution_tenant_time ON ai_execution(tenant_id, created_at DESC);

CREATE TABLE usage_record (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    feature_code    VARCHAR(80) NOT NULL,
    quantity        NUMERIC(18,4) NOT NULL,
    unit_code       VARCHAR(32) NOT NULL,
    reference_id    VARCHAR(240),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_tenant_feature_time ON usage_record(tenant_id, feature_code, occurred_at DESC);

-- Tenant RLS is intentionally not enabled in this reference file. Before enabling it,
-- set the tenant context from authenticated server-side identity in every transaction.
-- Example policy pattern (adapt and test before use):
-- ALTER TABLE lead ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY lead_tenant_isolation ON lead
--   USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
--   WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
