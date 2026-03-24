BEGIN;

-- Store parsed owner contact info and existing loan data from PropertyReach
ALTER TABLE loans.properties
    ADD COLUMN IF NOT EXISTS owner_info JSONB,       -- array of owners [{name, type, phones, mailingAddress, ownerOccupied, ownershipMonths}]
    ADD COLUMN IF NOT EXISTS existing_loans JSONB,    -- array of open loans [{lender, rate, term, originalAmount, estimatedBalance, estimatedPayment, loanType, recordingDate, dueDate}]
    ADD COLUMN IF NOT EXISTS estimated_value DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS assessed_value DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS annual_taxes DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS estimated_equity DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS lot_size_sqft INTEGER,
    ADD COLUMN IF NOT EXISTS lot_acres DECIMAL(10, 3),
    ADD COLUMN IF NOT EXISTS pool BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS garage_spaces INTEGER;

COMMIT;
