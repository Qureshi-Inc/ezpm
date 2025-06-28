-- Add missing property fields
ALTER TABLE properties 
ADD COLUMN bedrooms INTEGER,
ADD COLUMN bathrooms DECIMAL(3,1),
ADD COLUMN description TEXT;

-- Add unique constraint to prevent duplicate payment methods for the same tenant
ALTER TABLE payment_methods 
ADD CONSTRAINT unique_tenant_payment_method 
UNIQUE (tenant_id, type, last4); 