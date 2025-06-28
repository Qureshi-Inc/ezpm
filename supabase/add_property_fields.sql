-- Add missing property fields
ALTER TABLE properties 
ADD COLUMN bedrooms INTEGER,
ADD COLUMN bathrooms DECIMAL(3,1),
ADD COLUMN description TEXT; 