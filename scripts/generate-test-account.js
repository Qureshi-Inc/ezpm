#!/usr/bin/env node

// Generate a unique test account number for Moov testing
// These work with Moov's test routing numbers

function generateTestAccount() {
  // Use timestamp to make it unique
  const timestamp = Date.now().toString();
  // Pad to 12 digits (Moov accepts 4-17 digit account numbers)
  const accountNumber = timestamp.padEnd(12, '0').slice(0, 12);
  
  console.log('🏦 Unique Test Bank Account for Moov:\n');
  console.log('Routing Number: 110000000');
  console.log(`Account Number: ${accountNumber}`);
  console.log('Account Type: Checking\n');
  console.log('These numbers will work with Moov test mode.');
  console.log('For micro-deposits, use amounts: 0 and 0');
  
  return accountNumber;
}

generateTestAccount();
