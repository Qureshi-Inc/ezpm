-- Add Moov account ID to tenants table
ALTER TABLE tenants 
ADD COLUMN moov_account_id VARCHAR(255);

-- Add Moov payment method ID to payment_methods table
ALTER TABLE payment_methods 
ADD COLUMN moov_payment_method_id VARCHAR(255);

-- Update payment_methods type constraint to include moov_ach
ALTER TABLE payment_methods 
DROP CONSTRAINT payment_methods_type_check;

ALTER TABLE payment_methods 
ADD CONSTRAINT payment_methods_type_check 
CHECK (type IN ('card', 'moov_ach'));

-- Add Moov transfer ID to payments table
ALTER TABLE payments 
ADD COLUMN moov_transfer_id VARCHAR(255);

-- Create index for Moov fields
CREATE INDEX idx_tenants_moov_account_id ON tenants(moov_account_id);
CREATE INDEX idx_payment_methods_moov_payment_method_id ON payment_methods(moov_payment_method_id);
CREATE INDEX idx_payments_moov_transfer_id ON payments(moov_transfer_id); 