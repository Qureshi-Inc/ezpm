-- Simple database fix for payment_methods table
-- Run this in your Supabase SQL editor to add missing columns

-- Add the missing columns safely  
ALTER TABLE payment_methods
ADD COLUMN IF NOT EXISTS moov_payment_method_id text,
ADD COLUMN IF NOT EXISTS last4 text;
