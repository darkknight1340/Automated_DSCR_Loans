BEGIN;

-- Store computed analysis data for every processed lead (including rejected)
ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS analysis_data JSONB;

COMMIT;
