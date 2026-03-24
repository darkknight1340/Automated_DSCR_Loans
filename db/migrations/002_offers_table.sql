BEGIN;

-- Offers table for persisting loan offers sent to borrowers
CREATE TABLE IF NOT EXISTS leads.offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(100) NOT NULL UNIQUE,
    lead_id UUID REFERENCES leads.leads(id),
    application_id UUID REFERENCES loans.applications(id),

    -- Snapshot of offer data sent to borrower (stored as camelCase for frontend)
    borrower_data JSONB NOT NULL,
    property_data JSONB NOT NULL,
    dscr_data JSONB NOT NULL,
    loan_data JSONB NOT NULL,
    decision_data JSONB,

    -- Status
    status VARCHAR(20) DEFAULT 'PENDING',  -- PENDING, VERIFIED, EXPIRED, WITHDRAWN
    verified_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days'
);

CREATE INDEX IF NOT EXISTS idx_offers_token ON leads.offers(token);
CREATE INDEX IF NOT EXISTS idx_offers_lead ON leads.offers(lead_id);
CREATE INDEX IF NOT EXISTS idx_offers_application ON leads.offers(application_id);

COMMIT;
