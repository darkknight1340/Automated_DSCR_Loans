-- DSCR Loan Automation Platform - Initial Schema
-- Migration: 001_initial_schema
-- Created: 2024-01-15

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Create schemas
CREATE SCHEMA IF NOT EXISTS leads;
CREATE SCHEMA IF NOT EXISTS loans;
CREATE SCHEMA IF NOT EXISTS enrichment;
CREATE SCHEMA IF NOT EXISTS decisioning;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS audit;

-- Common types
CREATE TYPE loan_status AS ENUM (
    'PROSPECT', 'APPLICATION', 'PROCESSING', 'UNDERWRITING',
    'APPROVED', 'DENIED', 'SUSPENDED', 'WITHDRAWN',
    'CLOSING', 'FUNDED', 'POST_CLOSE', 'SOLD'
);

CREATE TYPE borrower_type AS ENUM ('INDIVIDUAL', 'ENTITY');
CREATE TYPE entity_type AS ENUM ('LLC', 'CORPORATION', 'PARTNERSHIP', 'TRUST');
CREATE TYPE property_type AS ENUM ('SFR', 'CONDO', 'TOWNHOUSE', '2_4_UNIT', 'MULTIFAMILY', 'MIXED_USE');
CREATE TYPE occupancy_type AS ENUM ('INVESTMENT', 'SECOND_HOME');  -- No primary for DSCR
CREATE TYPE loan_purpose AS ENUM ('PURCHASE', 'RATE_TERM_REFI', 'CASH_OUT_REFI');
CREATE TYPE condition_status AS ENUM ('OPEN', 'WAIVED', 'CLEARED', 'REOPENED');
CREATE TYPE condition_category AS ENUM ('PTD', 'PTC', 'PTF', 'POC');
CREATE TYPE decision_result AS ENUM ('APPROVED', 'DENIED', 'PENDING', 'EXCEPTION', 'MANUAL_REVIEW');

-- =====================================================
-- LEADS SCHEMA
-- =====================================================

CREATE TABLE leads.lead_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    source_type VARCHAR(50) NOT NULL,  -- 'website', 'referral', 'broker', 'marketing'
    api_key_hash VARCHAR(64),
    is_active BOOLEAN DEFAULT true,
    cost_per_lead DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(100) UNIQUE,  -- External reference (e.g., marketing platform ID)
    source_id UUID REFERENCES leads.lead_sources(id),

    -- Contact info
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    phone_secondary VARCHAR(20),

    -- Property info (initial)
    property_address VARCHAR(500),
    property_city VARCHAR(100),
    property_state VARCHAR(2),
    property_zip VARCHAR(10),
    property_type property_type,
    estimated_value DECIMAL(15, 2),

    -- Loan request
    loan_purpose loan_purpose,
    requested_amount DECIMAL(15, 2),
    estimated_rent DECIMAL(10, 2),

    -- Qualification
    stated_credit_score_range VARCHAR(20),  -- '740+', '700-739', etc.
    has_existing_mortgage BOOLEAN,
    existing_mortgage_balance DECIMAL(15, 2),
    is_entity_borrower BOOLEAN DEFAULT false,
    entity_name VARCHAR(255),

    -- Lead management
    status VARCHAR(50) DEFAULT 'NEW',  -- NEW, CONTACTED, QUALIFIED, DISQUALIFIED, CONVERTED
    score INTEGER,  -- 0-100 lead score
    assigned_lo_id UUID,
    converted_to_loan_id UUID,

    -- UTM tracking
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),

    -- Consent
    marketing_consent BOOLEAN DEFAULT false,
    marketing_consent_at TIMESTAMPTZ,
    tcpa_consent BOOLEAN DEFAULT false,
    tcpa_consent_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    first_contacted_at TIMESTAMPTZ,
    qualified_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_leads_email ON leads.leads(email);
CREATE INDEX idx_leads_phone ON leads.leads(phone);
CREATE INDEX idx_leads_status ON leads.leads(status);
CREATE INDEX idx_leads_score ON leads.leads(score DESC);
CREATE INDEX idx_leads_created_at ON leads.leads(created_at DESC);
CREATE INDEX idx_leads_source ON leads.leads(source_id);
CREATE INDEX idx_leads_assigned ON leads.leads(assigned_lo_id);
CREATE INDEX idx_leads_property_address ON leads.leads USING gin(property_address gin_trgm_ops);

CREATE TABLE leads.lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads.leads(id),
    activity_type VARCHAR(50) NOT NULL,  -- 'email_sent', 'call', 'sms', 'note', 'status_change'
    description TEXT,
    performed_by UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lead_activities_lead ON leads.lead_activities(lead_id, created_at DESC);

-- =====================================================
-- LOANS SCHEMA
-- =====================================================

CREATE TABLE loans.borrowers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    borrower_type borrower_type NOT NULL,

    -- Individual fields
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    suffix VARCHAR(20),
    ssn_encrypted BYTEA,  -- AES-256 encrypted
    ssn_last4 VARCHAR(4),  -- For display
    dob DATE,
    citizenship VARCHAR(50),

    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),
    phone_mobile VARCHAR(20),

    -- Address
    mailing_address VARCHAR(500),
    mailing_city VARCHAR(100),
    mailing_state VARCHAR(2),
    mailing_zip VARCHAR(10),

    -- Entity fields (if borrower_type = 'ENTITY')
    entity_name VARCHAR(255),
    entity_type entity_type,
    entity_state_of_formation VARCHAR(2),
    entity_formation_date DATE,
    entity_ein_encrypted BYTEA,
    entity_ein_last4 VARCHAR(4),

    -- Verification status
    identity_verified BOOLEAN DEFAULT false,
    identity_verified_at TIMESTAMPTZ,
    identity_verification_method VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_borrowers_email ON loans.borrowers(email);
CREATE INDEX idx_borrowers_ssn_last4 ON loans.borrowers(ssn_last4);
CREATE INDEX idx_borrowers_entity_name ON loans.borrowers(entity_name);

CREATE TABLE loans.guarantors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    borrower_id UUID NOT NULL REFERENCES loans.borrowers(id),  -- The entity being guaranteed for

    -- Guarantor personal info
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    ssn_encrypted BYTEA,
    ssn_last4 VARCHAR(4),
    dob DATE,
    ownership_percentage DECIMAL(5, 2),  -- % ownership in entity

    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),

    -- Address
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(10),

    -- Guarantee terms
    guarantee_type VARCHAR(50) DEFAULT 'FULL',  -- 'FULL', 'LIMITED', 'SEVERAL'
    is_primary BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guarantors_borrower ON loans.guarantors(borrower_id);

CREATE TABLE loans.properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Address
    address VARCHAR(500) NOT NULL,
    unit VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    county VARCHAR(100),
    state VARCHAR(2) NOT NULL,
    zip VARCHAR(10) NOT NULL,

    -- Property details
    property_type property_type NOT NULL,
    occupancy_type occupancy_type DEFAULT 'INVESTMENT',
    year_built INTEGER,
    square_feet INTEGER,
    lot_size_sqft INTEGER,
    bedrooms INTEGER,
    bathrooms DECIMAL(3, 1),
    stories INTEGER,
    units INTEGER DEFAULT 1,  -- For multi-family

    -- HOA
    has_hoa BOOLEAN DEFAULT false,
    hoa_monthly DECIMAL(10, 2),
    hoa_name VARCHAR(255),

    -- Legal
    apn VARCHAR(50),  -- Assessor Parcel Number
    legal_description TEXT,

    -- Rental info
    is_currently_rented BOOLEAN,
    current_monthly_rent DECIMAL(10, 2),
    market_monthly_rent DECIMAL(10, 2),
    is_short_term_rental BOOLEAN DEFAULT false,

    -- Verification
    address_standardized BOOLEAN DEFAULT false,
    geocoded BOOLEAN DEFAULT false,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_address ON loans.properties USING gin(address gin_trgm_ops);
CREATE INDEX idx_properties_state_zip ON loans.properties(state, zip);
CREATE INDEX idx_properties_type ON loans.properties(property_type);

CREATE TABLE loans.rent_rolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES loans.properties(id),

    -- Unit info
    unit_number VARCHAR(50),
    unit_type VARCHAR(50),  -- '1BR', '2BR', 'Studio', etc.
    square_feet INTEGER,

    -- Lease info
    tenant_name VARCHAR(255),
    lease_start_date DATE,
    lease_end_date DATE,
    lease_type VARCHAR(50),  -- 'ANNUAL', 'MONTH_TO_MONTH', 'STR'

    -- Rent
    monthly_rent DECIMAL(10, 2) NOT NULL,
    security_deposit DECIMAL(10, 2),

    -- Status
    is_vacant BOOLEAN DEFAULT false,
    vacancy_start_date DATE,

    -- For STR properties
    avg_nightly_rate DECIMAL(10, 2),
    avg_occupancy_rate DECIMAL(5, 2),  -- As percentage

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rent_rolls_property ON loans.rent_rolls(property_id);

CREATE TABLE loans.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads.leads(id),

    -- Primary references
    borrower_id UUID NOT NULL REFERENCES loans.borrowers(id),
    property_id UUID NOT NULL REFERENCES loans.properties(id),

    -- Loan terms
    loan_purpose loan_purpose NOT NULL,
    loan_amount DECIMAL(15, 2) NOT NULL,
    loan_term_months INTEGER DEFAULT 360,
    amortization_type VARCHAR(50) DEFAULT 'FIXED',  -- 'FIXED', 'ARM', 'IO'
    interest_only_period_months INTEGER,

    -- Property financials (for DSCR)
    purchase_price DECIMAL(15, 2),  -- For purchases
    estimated_value DECIMAL(15, 2),
    existing_liens_total DECIMAL(15, 2) DEFAULT 0,

    -- Calculated fields (denormalized for query performance)
    ltv_ratio DECIMAL(5, 4),
    cltv_ratio DECIMAL(5, 4),

    -- Cash out (for refinance)
    cash_out_amount DECIMAL(15, 2),
    cash_out_purpose VARCHAR(255),

    -- Reserves
    reserves_months_required INTEGER DEFAULT 6,
    reserves_verified DECIMAL(15, 2),

    -- Status
    status loan_status DEFAULT 'PROSPECT',
    submitted_at TIMESTAMPTZ,

    -- Assigned users
    assigned_lo_id UUID,
    assigned_processor_id UUID,
    assigned_uw_id UUID,
    assigned_closer_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_applications_borrower ON loans.applications(borrower_id);
CREATE INDEX idx_applications_property ON loans.applications(property_id);
CREATE INDEX idx_applications_status ON loans.applications(status);
CREATE INDEX idx_applications_created ON loans.applications(created_at DESC);
CREATE INDEX idx_applications_lead ON loans.applications(lead_id);

-- Encompass link table - critical for LOS sync
CREATE TABLE loans.encompass_loan_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id) UNIQUE,

    -- Encompass identifiers
    encompass_loan_guid VARCHAR(50) NOT NULL UNIQUE,
    encompass_loan_number VARCHAR(20),
    encompass_folder VARCHAR(100),

    -- Sync state
    last_sync_to_encompass TIMESTAMPTZ,
    last_sync_from_encompass TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'SYNCED',  -- 'SYNCED', 'PENDING', 'FAILED', 'CONFLICT'
    sync_error_message TEXT,
    sync_retry_count INTEGER DEFAULT 0,

    -- Field sync tracking
    fields_pending_sync JSONB DEFAULT '[]',
    last_field_sync_at TIMESTAMPTZ,

    -- Milestone tracking
    current_milestone VARCHAR(50),
    milestone_updated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_encompass_links_guid ON loans.encompass_loan_links(encompass_loan_guid);
CREATE INDEX idx_encompass_links_sync ON loans.encompass_loan_links(sync_status);

-- =====================================================
-- ENRICHMENT SCHEMA
-- =====================================================

CREATE TABLE enrichment.credit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),
    borrower_id UUID NOT NULL REFERENCES loans.borrowers(id),

    -- Order info
    order_id VARCHAR(100) NOT NULL UNIQUE,  -- Our order ID
    vendor_order_id VARCHAR(100),  -- Vendor's order ID
    vendor VARCHAR(50) NOT NULL,  -- 'MERIDIANLINK', 'CREDITPLUS', etc.

    -- Pull type
    pull_type VARCHAR(20) NOT NULL,  -- 'SOFT', 'HARD'
    bureaus_requested VARCHAR(50)[],  -- ['EXPERIAN', 'EQUIFAX', 'TRANSUNION']
    bureaus_returned VARCHAR(50)[],

    -- Scores
    score_experian INTEGER,
    score_equifax INTEGER,
    score_transunion INTEGER,
    score_representative INTEGER,  -- The score we use for decisioning
    score_model VARCHAR(50),  -- 'FICO8', 'FICO9', 'VANTAGE3'

    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'RECEIVED', 'ERROR', 'EXPIRED'

    -- Report data (encrypted)
    report_data_encrypted BYTEA,
    report_xml_encrypted BYTEA,

    -- Timestamps
    ordered_at TIMESTAMPTZ DEFAULT NOW(),
    received_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,  -- Credit reports expire (typically 120 days)

    -- Encompass sync
    synced_to_encompass BOOLEAN DEFAULT false,
    encompass_service_id VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_reports_application ON enrichment.credit_reports(application_id);
CREATE INDEX idx_credit_reports_borrower ON enrichment.credit_reports(borrower_id);
CREATE INDEX idx_credit_reports_order ON enrichment.credit_reports(order_id);

CREATE TABLE enrichment.credit_tradelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_report_id UUID NOT NULL REFERENCES enrichment.credit_reports(id),

    -- Account info
    creditor_name VARCHAR(255),
    account_number_masked VARCHAR(20),
    account_type VARCHAR(50),  -- 'MORTGAGE', 'INSTALLMENT', 'REVOLVING', etc.

    -- Balances
    credit_limit DECIMAL(15, 2),
    high_balance DECIMAL(15, 2),
    current_balance DECIMAL(15, 2),
    monthly_payment DECIMAL(10, 2),

    -- Status
    account_status VARCHAR(50),  -- 'OPEN', 'CLOSED', 'PAID'
    payment_status VARCHAR(50),  -- 'CURRENT', '30_DAYS', '60_DAYS', etc.

    -- History
    opened_date DATE,
    closed_date DATE,
    last_activity_date DATE,
    times_30_late INTEGER DEFAULT 0,
    times_60_late INTEGER DEFAULT 0,
    times_90_late INTEGER DEFAULT 0,

    -- For mortgage tradelines (important for refi)
    is_mortgage BOOLEAN DEFAULT false,
    property_address VARCHAR(500),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tradelines_report ON enrichment.credit_tradelines(credit_report_id);
CREATE INDEX idx_credit_tradelines_mortgage ON enrichment.credit_tradelines(credit_report_id) WHERE is_mortgage = true;

CREATE TABLE enrichment.avm_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES loans.properties(id),
    application_id UUID REFERENCES loans.applications(id),

    -- Order info
    order_id VARCHAR(100) NOT NULL UNIQUE,
    vendor VARCHAR(50) NOT NULL,  -- 'CORELOGIC', 'HOUSECANARY', 'BLACKKNIGHT', 'QUANTARIUM'
    product_type VARCHAR(50),  -- 'CASCADE', 'COLLATERAL_DESKTOP', etc.

    -- Valuation results
    value_estimated DECIMAL(15, 2),
    value_low DECIMAL(15, 2),
    value_high DECIMAL(15, 2),
    confidence_score DECIMAL(5, 2),  -- 0-100
    confidence_level VARCHAR(20),  -- 'HIGH', 'MEDIUM', 'LOW'
    fsd DECIMAL(5, 4),  -- Forecast Standard Deviation

    -- Supporting data
    comparable_count INTEGER,
    sale_date_last DATE,
    sale_price_last DECIMAL(15, 2),

    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'RECEIVED', 'NO_VALUE', 'ERROR'

    -- Full report (stored as JSON)
    report_data JSONB,

    -- Timestamps
    ordered_at TIMESTAMPTZ DEFAULT NOW(),
    received_at TIMESTAMPTZ,
    value_as_of_date DATE,

    -- Encompass sync
    synced_to_encompass BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_avm_reports_property ON enrichment.avm_reports(property_id);
CREATE INDEX idx_avm_reports_application ON enrichment.avm_reports(application_id);
CREATE INDEX idx_avm_reports_status ON enrichment.avm_reports(status);

CREATE TABLE enrichment.appraisals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES loans.properties(id),
    application_id UUID NOT NULL REFERENCES loans.applications(id),

    -- Order info
    order_id VARCHAR(100) NOT NULL UNIQUE,
    amc_name VARCHAR(100),
    amc_order_id VARCHAR(100),
    appraiser_name VARCHAR(255),
    appraiser_license VARCHAR(50),

    -- Appraisal type
    appraisal_type VARCHAR(50),  -- 'FULL_INTERIOR', '1004D', 'DESKTOP', 'DRIVE_BY'
    form_type VARCHAR(20),  -- '1004', '1025', '1073', etc.

    -- Valuation
    appraised_value DECIMAL(15, 2),

    -- Property details from appraisal
    condition_rating VARCHAR(20),  -- C1-C6
    quality_rating VARCHAR(20),  -- Q1-Q6
    gla_sqft INTEGER,  -- Gross Living Area
    site_size_sqft INTEGER,

    -- Status
    status VARCHAR(30) DEFAULT 'ORDERED',
    -- 'ORDERED', 'SCHEDULED', 'INSPECTION_COMPLETE', 'IN_REVIEW', 'RECEIVED', 'DISPUTED', 'FINAL'

    -- Dates
    ordered_at TIMESTAMPTZ DEFAULT NOW(),
    inspection_scheduled_at TIMESTAMPTZ,
    inspection_completed_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    effective_date DATE,

    -- Document
    document_id UUID,  -- Reference to documents.document_registry

    -- Encompass sync
    encompass_service_id VARCHAR(100),
    synced_to_encompass BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appraisals_property ON enrichment.appraisals(property_id);
CREATE INDEX idx_appraisals_application ON enrichment.appraisals(application_id);
CREATE INDEX idx_appraisals_status ON enrichment.appraisals(status);

CREATE TABLE enrichment.entity_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    borrower_id UUID NOT NULL REFERENCES loans.borrowers(id),

    -- Verification type
    verification_type VARCHAR(50) NOT NULL,
    -- 'SOS_FILING', 'GOOD_STANDING', 'EIN_VERIFICATION', 'BENEFICIAL_OWNER'

    -- Result
    status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'VERIFIED', 'FAILED', 'MANUAL'
    verified_at TIMESTAMPTZ,

    -- Details
    verified_entity_name VARCHAR(255),
    verified_state VARCHAR(2),
    verified_status VARCHAR(50),  -- 'ACTIVE', 'DISSOLVED', etc.
    filing_date DATE,
    annual_report_due DATE,

    -- Document
    document_id UUID,

    -- Raw response
    raw_response JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_verifications_borrower ON enrichment.entity_verifications(borrower_id);

-- =====================================================
-- DECISIONING SCHEMA
-- =====================================================

CREATE TABLE decisioning.rule_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Rule identity
    rule_set_name VARCHAR(100) NOT NULL,  -- 'DSCR_ELIGIBILITY_V1', 'PRICING_ADDERS_V1'
    version VARCHAR(20) NOT NULL,

    -- Rule content
    rules JSONB NOT NULL,  -- The actual rules in JSON format

    -- Metadata
    description TEXT,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,  -- NULL means currently active

    -- Approval
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(rule_set_name, version)
);

CREATE INDEX idx_rule_versions_active ON decisioning.rule_versions(rule_set_name) WHERE is_active = true;
CREATE INDEX idx_rule_versions_effective ON decisioning.rule_versions(effective_from, effective_to);

CREATE TABLE decisioning.rule_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),
    rule_version_id UUID NOT NULL REFERENCES decisioning.rule_versions(id),

    -- Evaluation context
    evaluation_type VARCHAR(50) NOT NULL,  -- 'ELIGIBILITY', 'PRICING', 'CONDITIONS'
    trigger_event VARCHAR(50),  -- What triggered this evaluation

    -- Input snapshot (what data was used)
    input_snapshot JSONB NOT NULL,

    -- Results
    overall_result decision_result NOT NULL,
    rule_results JSONB NOT NULL,  -- Individual rule results

    -- Metrics
    rules_evaluated INTEGER,
    rules_passed INTEGER,
    rules_failed INTEGER,
    rules_warned INTEGER,
    rules_skipped INTEGER,

    -- Performance
    evaluation_duration_ms INTEGER,

    -- Timestamps
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Encompass sync
    synced_to_encompass BOOLEAN DEFAULT false
);

CREATE INDEX idx_rule_evaluations_application ON decisioning.rule_evaluations(application_id, evaluated_at DESC);
CREATE INDEX idx_rule_evaluations_result ON decisioning.rule_evaluations(overall_result);

CREATE TABLE decisioning.pricing_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Card identity
    card_name VARCHAR(100) NOT NULL,
    product_type VARCHAR(50) NOT NULL,  -- 'DSCR_30YR_FIXED', 'DSCR_ARM_5_1'

    -- Effective dates
    effective_date DATE NOT NULL,
    expiration_date DATE,

    -- Base rates by LTV
    base_rates JSONB NOT NULL,  -- { "65": 7.25, "70": 7.375, "75": 7.50, "80": 7.75 }

    -- Lock periods
    lock_periods JSONB NOT NULL,  -- { "30": 0, "45": 0.125, "60": 0.25 }

    -- Adders/adjustments
    adders JSONB NOT NULL,  -- Structured adder rules

    -- Status
    is_active BOOLEAN DEFAULT false,

    -- Approval
    created_by UUID,
    approved_by UUID,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_cards_active ON decisioning.pricing_cards(product_type, effective_date DESC) WHERE is_active = true;

CREATE TABLE decisioning.pricing_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),
    pricing_card_id UUID NOT NULL REFERENCES decisioning.pricing_cards(id),

    -- Input values
    ltv_ratio DECIMAL(5, 4) NOT NULL,
    credit_score INTEGER NOT NULL,
    dscr_ratio DECIMAL(5, 3) NOT NULL,
    loan_amount DECIMAL(15, 2) NOT NULL,
    lock_period_days INTEGER NOT NULL,

    -- Calculation results
    base_rate DECIMAL(5, 4) NOT NULL,

    -- Individual adders
    ltv_adder DECIMAL(5, 4) DEFAULT 0,
    credit_adder DECIMAL(5, 4) DEFAULT 0,
    dscr_adder DECIMAL(5, 4) DEFAULT 0,
    loan_amount_adder DECIMAL(5, 4) DEFAULT 0,
    property_type_adder DECIMAL(5, 4) DEFAULT 0,
    lock_adder DECIMAL(5, 4) DEFAULT 0,
    cash_out_adder DECIMAL(5, 4) DEFAULT 0,
    prepay_credit DECIMAL(5, 4) DEFAULT 0,  -- Can be negative (discount)

    -- Totals
    total_adders DECIMAL(5, 4) NOT NULL,
    final_rate DECIMAL(5, 4) NOT NULL,

    -- Adder detail (for audit)
    adder_details JSONB NOT NULL,

    -- Status
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,

    -- Timestamps
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Encompass sync
    synced_to_encompass BOOLEAN DEFAULT false
);

CREATE INDEX idx_pricing_calculations_application ON decisioning.pricing_calculations(application_id, calculated_at DESC);
CREATE INDEX idx_pricing_calculations_locked ON decisioning.pricing_calculations(application_id) WHERE is_locked = true;

CREATE TABLE decisioning.conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),

    -- Condition identity
    condition_code VARCHAR(20) NOT NULL,
    category condition_category NOT NULL,

    -- Content
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Responsibility
    responsible_party VARCHAR(50) NOT NULL,  -- 'BORROWER', 'LO', 'PROCESSOR', 'UW', 'CLOSER'
    assigned_to UUID,

    -- Status tracking
    status condition_status DEFAULT 'OPEN',
    status_changed_at TIMESTAMPTZ,
    status_changed_by UUID,

    -- Auto-clear rules
    auto_clear_rules JSONB,

    -- Clearing info
    cleared_at TIMESTAMPTZ,
    cleared_by UUID,
    clear_notes TEXT,
    supporting_document_id UUID,

    -- Source
    source VARCHAR(50) DEFAULT 'SYSTEM',  -- 'SYSTEM', 'UW', 'INVESTOR'
    rule_id VARCHAR(50),  -- If system-generated, which rule created it

    -- Encompass sync
    encompass_condition_id VARCHAR(100),
    synced_to_encompass BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conditions_application ON decisioning.conditions(application_id, category);
CREATE INDEX idx_conditions_status ON decisioning.conditions(application_id, status);
CREATE INDEX idx_conditions_responsible ON decisioning.conditions(responsible_party, status);

CREATE TABLE decisioning.decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),

    -- Decision info
    decision_type VARCHAR(50) NOT NULL,  -- 'PRE_APPROVAL', 'FINAL_APPROVAL', 'DENIAL', 'SUSPENSION'
    decision_result decision_result NOT NULL,

    -- Supporting evaluations
    eligibility_evaluation_id UUID REFERENCES decisioning.rule_evaluations(id),
    pricing_calculation_id UUID REFERENCES decisioning.pricing_calculations(id),

    -- Decision details
    summary TEXT NOT NULL,
    conditions_added INTEGER DEFAULT 0,
    exceptions_noted JSONB,

    -- For denials
    denial_reasons JSONB,
    adverse_action_required BOOLEAN DEFAULT false,
    adverse_action_sent_at TIMESTAMPTZ,

    -- Approval chain
    decided_by VARCHAR(50),  -- 'SYSTEM' or user ID
    decision_authority VARCHAR(50),  -- 'AUTO', 'LO', 'UW', 'SENIOR_UW', 'CREDIT_COMMITTEE'

    -- Override tracking
    is_override BOOLEAN DEFAULT false,
    override_reason TEXT,
    override_approved_by UUID,

    -- Timestamps
    decided_at TIMESTAMPTZ DEFAULT NOW(),

    -- Encompass sync
    synced_to_encompass BOOLEAN DEFAULT false
);

CREATE INDEX idx_decisions_application ON decisioning.decisions(application_id, decided_at DESC);
CREATE INDEX idx_decisions_type ON decisioning.decisions(decision_type, decision_result);

-- =====================================================
-- WORKFLOW SCHEMA
-- =====================================================

CREATE TABLE workflow.workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    trigger_event VARCHAR(50),
    steps JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow.workflow_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_definition_id UUID NOT NULL REFERENCES workflow.workflow_definitions(id),
    application_id UUID NOT NULL REFERENCES loans.applications(id),

    -- State
    current_step VARCHAR(100),
    status VARCHAR(20) DEFAULT 'RUNNING',  -- 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'

    -- Context
    context JSONB DEFAULT '{}',

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_instances_application ON workflow.workflow_instances(application_id);
CREATE INDEX idx_workflow_instances_status ON workflow.workflow_instances(status);

CREATE TABLE workflow.workflow_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_instance_id UUID REFERENCES workflow.workflow_instances(id),
    application_id UUID NOT NULL REFERENCES loans.applications(id),

    -- Task info
    task_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Assignment
    assigned_to UUID,
    assigned_role VARCHAR(50),

    -- Priority & timing
    priority INTEGER DEFAULT 50,  -- 0-100
    due_at TIMESTAMPTZ,
    sla_hours INTEGER,

    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED'

    -- Completion
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    outcome VARCHAR(50),
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_tasks_application ON workflow.workflow_tasks(application_id);
CREATE INDEX idx_workflow_tasks_assigned ON workflow.workflow_tasks(assigned_to, status);
CREATE INDEX idx_workflow_tasks_due ON workflow.workflow_tasks(due_at) WHERE status = 'PENDING';

CREATE TABLE workflow.milestone_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loans.applications(id),
    encompass_loan_guid VARCHAR(50),

    -- Milestone change
    previous_milestone VARCHAR(50),
    new_milestone VARCHAR(50) NOT NULL,

    -- Change info
    changed_by VARCHAR(100),  -- User ID or 'SYSTEM'
    change_source VARCHAR(50),  -- 'AUTOMATION', 'MANUAL', 'ENCOMPASS_WEBHOOK'
    change_reason TEXT,

    -- Timing
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    time_in_previous_ms BIGINT  -- How long was it in the previous milestone
);

CREATE INDEX idx_milestone_history_application ON workflow.milestone_history(application_id, changed_at DESC);
CREATE INDEX idx_milestone_history_encompass ON workflow.milestone_history(encompass_loan_guid);

-- =====================================================
-- DOCUMENTS SCHEMA
-- =====================================================

CREATE TABLE documents.document_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),  -- 'APPLICATION', 'INCOME', 'ASSET', 'PROPERTY', 'TITLE', 'INSURANCE', 'CLOSING'
    is_required_for_product JSONB,  -- { "DSCR": true, "CONVENTIONAL": false }
    retention_years INTEGER DEFAULT 7,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents.document_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES loans.applications(id),
    borrower_id UUID REFERENCES loans.borrowers(id),
    property_id UUID REFERENCES loans.properties(id),

    -- Document info
    document_type_id UUID REFERENCES documents.document_types(id),
    document_type_code VARCHAR(50),  -- Denormalized for quick access

    -- File info
    original_filename VARCHAR(255),
    stored_filename VARCHAR(255),
    storage_path VARCHAR(500),
    storage_bucket VARCHAR(100),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    page_count INTEGER,

    -- Content hash (for deduplication and integrity)
    content_hash VARCHAR(64),

    -- Classification
    is_auto_classified BOOLEAN DEFAULT false,
    classification_confidence DECIMAL(3, 2),

    -- Processing status
    status VARCHAR(20) DEFAULT 'UPLOADED',  -- 'UPLOADED', 'PROCESSING', 'CLASSIFIED', 'VERIFIED', 'REJECTED'
    ocr_status VARCHAR(20),
    ocr_text TEXT,

    -- Verification
    verified_at TIMESTAMPTZ,
    verified_by UUID,

    -- Encompass
    encompass_document_id VARCHAR(100),
    synced_to_encompass BOOLEAN DEFAULT false,

    -- Source
    source VARCHAR(50),  -- 'BORROWER_UPLOAD', 'EMAIL', 'VENDOR', 'SYSTEM'
    uploaded_by UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_application ON documents.document_registry(application_id);
CREATE INDEX idx_documents_type ON documents.document_registry(document_type_code);
CREATE INDEX idx_documents_hash ON documents.document_registry(content_hash);
CREATE INDEX idx_documents_status ON documents.document_registry(status);

CREATE TABLE documents.document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents.document_registry(id),
    version_number INTEGER NOT NULL,

    -- Previous version reference
    previous_version_id UUID REFERENCES documents.document_versions(id),

    -- File info (version-specific)
    storage_path VARCHAR(500),
    file_size_bytes BIGINT,
    content_hash VARCHAR(64),

    -- Change info
    change_reason TEXT,
    created_by UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id, version_number)
);

CREATE INDEX idx_document_versions_document ON documents.document_versions(document_id, version_number DESC);

-- =====================================================
-- AUDIT SCHEMA
-- =====================================================

CREATE TABLE audit.audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Event identity
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50),  -- 'LOAN', 'USER', 'SYSTEM', 'SECURITY', 'COMPLIANCE'

    -- Context
    application_id UUID,
    encompass_loan_guid VARCHAR(50),
    user_id UUID,
    ip_address INET,
    user_agent TEXT,

    -- Event details
    action VARCHAR(50) NOT NULL,  -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'DENY', etc.
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),

    -- Before/after state (for changes)
    previous_state JSONB,
    new_state JSONB,
    changes JSONB,  -- Diff of what changed

    -- Additional context
    metadata JSONB,

    -- Correlation
    correlation_id UUID,
    causation_id UUID,

    -- Timestamp (partitioning key)
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions for audit events (monthly)
CREATE TABLE audit.audit_events_2024_01 PARTITION OF audit.audit_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE audit.audit_events_2024_02 PARTITION OF audit.audit_events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Continue for each month...

CREATE INDEX idx_audit_events_application ON audit.audit_events(application_id, created_at DESC);
CREATE INDEX idx_audit_events_user ON audit.audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_type ON audit.audit_events(event_type, created_at DESC);
CREATE INDEX idx_audit_events_encompass ON audit.audit_events(encompass_loan_guid, created_at DESC);

CREATE TABLE audit.data_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who accessed
    user_id UUID NOT NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(50),

    -- What was accessed
    resource_type VARCHAR(50) NOT NULL,  -- 'LOAN', 'BORROWER', 'CREDIT_REPORT', etc.
    resource_id UUID NOT NULL,
    application_id UUID,

    -- Access details
    access_type VARCHAR(20) NOT NULL,  -- 'VIEW', 'EXPORT', 'PRINT'
    fields_accessed VARCHAR(255)[],  -- Specific fields (for PII tracking)

    -- Context
    ip_address INET,
    user_agent TEXT,
    access_reason VARCHAR(255),

    -- Timestamp
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_access_user ON audit.data_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_data_access_resource ON audit.data_access_log(resource_type, resource_id, accessed_at DESC);

-- =====================================================
-- VIEWS
-- =====================================================

-- Loan summary view for quick access
CREATE VIEW loans.loan_summary AS
SELECT
    a.id AS application_id,
    a.status,
    a.loan_amount,
    a.loan_purpose,
    a.ltv_ratio,
    b.borrower_type,
    CASE
        WHEN b.borrower_type = 'INDIVIDUAL' THEN b.first_name || ' ' || b.last_name
        ELSE b.entity_name
    END AS borrower_name,
    p.address AS property_address,
    p.city AS property_city,
    p.state AS property_state,
    p.property_type,
    el.encompass_loan_guid,
    el.encompass_loan_number,
    el.current_milestone,
    a.assigned_lo_id,
    a.assigned_processor_id,
    a.assigned_uw_id,
    a.created_at,
    a.submitted_at
FROM loans.applications a
JOIN loans.borrowers b ON a.borrower_id = b.id
JOIN loans.properties p ON a.property_id = p.id
LEFT JOIN loans.encompass_loan_links el ON a.id = el.application_id;

-- DSCR calculation view
CREATE VIEW loans.dscr_calculations AS
SELECT
    a.id AS application_id,
    el.encompass_loan_guid,
    p.id AS property_id,
    -- Gross potential rent
    COALESCE(SUM(rr.monthly_rent), p.current_monthly_rent) AS gross_monthly_rent,
    -- Vacancy allowance (assume 5%)
    COALESCE(SUM(rr.monthly_rent), p.current_monthly_rent) * 0.95 AS effective_gross_rent,
    -- Operating expenses (get from other tables)
    COALESCE(p.hoa_monthly, 0) AS hoa_monthly,
    -- This would need property tax and insurance from enrichment
    0 AS property_tax_monthly,  -- Placeholder
    0 AS insurance_monthly,  -- Placeholder
    -- Calculate NOI (simplified)
    (COALESCE(SUM(rr.monthly_rent), p.current_monthly_rent) * 0.95) - COALESCE(p.hoa_monthly, 0) AS noi_monthly
FROM loans.applications a
JOIN loans.properties p ON a.property_id = p.id
LEFT JOIN loans.rent_rolls rr ON p.id = rr.property_id AND rr.is_vacant = false
LEFT JOIN loans.encompass_loan_links el ON a.id = el.application_id
GROUP BY a.id, el.encompass_loan_guid, p.id, p.current_monthly_rent, p.hoa_monthly;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to calculate DSCR
CREATE OR REPLACE FUNCTION loans.calculate_dscr(
    p_noi_monthly DECIMAL,
    p_loan_amount DECIMAL,
    p_interest_rate DECIMAL,
    p_term_months INTEGER,
    p_io_period_months INTEGER DEFAULT 0
) RETURNS DECIMAL AS $$
DECLARE
    v_monthly_rate DECIMAL;
    v_monthly_payment DECIMAL;
    v_dscr DECIMAL;
BEGIN
    v_monthly_rate := p_interest_rate / 12;

    IF p_io_period_months > 0 THEN
        -- Interest-only payment
        v_monthly_payment := p_loan_amount * v_monthly_rate;
    ELSE
        -- Fully amortizing payment
        v_monthly_payment := p_loan_amount * (v_monthly_rate * POWER(1 + v_monthly_rate, p_term_months)) /
                           (POWER(1 + v_monthly_rate, p_term_months) - 1);
    END IF;

    IF v_monthly_payment > 0 THEN
        v_dscr := p_noi_monthly / v_monthly_payment;
    ELSE
        v_dscr := NULL;
    END IF;

    RETURN ROUND(v_dscr, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to encrypt SSN
CREATE OR REPLACE FUNCTION loans.encrypt_ssn(p_ssn VARCHAR, p_key BYTEA)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(p_ssn, encode(p_key, 'hex'));
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt SSN
CREATE OR REPLACE FUNCTION loans.decrypt_ssn(p_encrypted BYTEA, p_key BYTEA)
RETURNS VARCHAR AS $$
BEGIN
    RETURN pgp_sym_decrypt(p_encrypted, encode(p_key, 'hex'));
END;
$$ LANGUAGE plpgsql;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables that have it
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema IN ('leads', 'loans', 'enrichment', 'decisioning', 'workflow', 'documents')
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_%I_updated_at ON %I.%I;
            CREATE TRIGGER update_%I_%I_updated_at
            BEFORE UPDATE ON %I.%I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t.table_schema, t.table_name, t.table_schema, t.table_name,
           t.table_schema, t.table_name, t.table_schema, t.table_name);
    END LOOP;
END;
$$;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default document types
INSERT INTO documents.document_types (code, name, category, is_required_for_product) VALUES
    ('APPLICATION', '1003 Loan Application', 'APPLICATION', '{"DSCR": true}'),
    ('ID', 'Government Issued ID', 'APPLICATION', '{"DSCR": true}'),
    ('RENT_ROLL', 'Rent Roll', 'PROPERTY', '{"DSCR": true}'),
    ('LEASE', 'Lease Agreement', 'PROPERTY', '{"DSCR": false}'),
    ('BANK_STATEMENT', 'Bank Statement', 'ASSET', '{"DSCR": true}'),
    ('OPERATING_AGREEMENT', 'LLC Operating Agreement', 'APPLICATION', '{"DSCR": false}'),
    ('CERTIFICATE_GOOD_STANDING', 'Certificate of Good Standing', 'APPLICATION', '{"DSCR": false}'),
    ('ARTICLES_OF_ORGANIZATION', 'Articles of Organization', 'APPLICATION', '{"DSCR": false}'),
    ('TITLE_COMMITMENT', 'Title Commitment', 'TITLE', '{"DSCR": true}'),
    ('INSURANCE_BINDER', 'Insurance Binder', 'INSURANCE', '{"DSCR": true}'),
    ('FLOOD_CERT', 'Flood Certification', 'INSURANCE', '{"DSCR": true}'),
    ('APPRAISAL', 'Appraisal Report', 'PROPERTY', '{"DSCR": true}'),
    ('CREDIT_REPORT', 'Credit Report', 'APPLICATION', '{"DSCR": true}'),
    ('PURCHASE_CONTRACT', 'Purchase Contract', 'APPLICATION', '{"DSCR": false}'),
    ('PAYOFF_STATEMENT', 'Payoff Statement', 'APPLICATION', '{"DSCR": false}'),
    ('CLOSING_DISCLOSURE', 'Closing Disclosure', 'CLOSING', '{"DSCR": true}'),
    ('NOTE', 'Promissory Note', 'CLOSING', '{"DSCR": true}'),
    ('DEED_OF_TRUST', 'Deed of Trust / Mortgage', 'CLOSING', '{"DSCR": true}')
ON CONFLICT (code) DO NOTHING;

-- Insert default lead sources
INSERT INTO leads.lead_sources (name, source_type) VALUES
    ('Website', 'website'),
    ('Direct Mail', 'marketing'),
    ('Google Ads', 'marketing'),
    ('Facebook Ads', 'marketing'),
    ('Broker Referral', 'referral'),
    ('Client Referral', 'referral'),
    ('Realtor Referral', 'referral'),
    ('Zillow', 'marketplace'),
    ('LendingTree', 'marketplace')
ON CONFLICT (name) DO NOTHING;

COMMIT;
