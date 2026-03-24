BEGIN;

-- Store raw API responses for reference / debugging / audit
CREATE TABLE IF NOT EXISTS enrichment.api_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What property / application this relates to
    property_id UUID REFERENCES loans.properties(id),
    application_id UUID REFERENCES loans.applications(id),
    lead_id UUID REFERENCES leads.leads(id),

    -- Provider info
    provider VARCHAR(50) NOT NULL,   -- 'PROPERTYREACH', 'RENTCAST', 'DATATREE'
    endpoint VARCHAR(200) NOT NULL,  -- e.g. '/property', '/avm/rent/long-term'

    -- Request context
    request_params JSONB,            -- query params / body sent

    -- Full response
    response_data JSONB NOT NULL,    -- raw API JSON response
    http_status INTEGER,             -- HTTP status code

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_responses_property ON enrichment.api_responses(property_id);
CREATE INDEX IF NOT EXISTS idx_api_responses_provider ON enrichment.api_responses(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_responses_lead ON enrichment.api_responses(lead_id);

COMMIT;
