-- Add verification status for bank accounts
ALTER TABLE payment_methods 
ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;

-- Set all existing card payment methods as verified (cards don't need micro-deposit verification)
UPDATE payment_methods 
SET is_verified = TRUE 
WHERE type = 'card';

-- Moov ACH accounts will be FALSE by default until verified
