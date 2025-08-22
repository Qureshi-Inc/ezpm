# Moov Test Bank Accounts

For testing micro-deposits in Moov's **production** environment, use these test account numbers:

## Test Bank Accounts (Always Work)

### Account 1 - Instant Approval
- **Routing Number:** `110000000`
- **Account Number:** `000123456789`
- **Account Type:** Checking

### Account 2 - Instant Approval  
- **Routing Number:** `021000021`
- **Account Number:** `000123456789`
- **Account Type:** Checking

### Account 3 - For Testing Failures
- **Routing Number:** `000000000`
- **Account Number:** `000000000000`
- **Account Type:** Checking
- This will simulate various failure scenarios

## How Micro-Deposits Work in Test Mode

When you use test accounts:
- Micro-deposits are automatically set to `$0.00` and `$0.00`
- You can instantly verify with amounts: `0` and `0`
- No actual money moves
- Verification is instant

## Important Notes

1. These test accounts work in Moov's **production** environment
2. They bypass identity verification requirements
3. Perfect for development and testing
4. DO NOT use real bank account numbers in testing

## To Test:

1. Go to your onboarding flow
2. Use one of the test account numbers above
3. When prompted for micro-deposit amounts, enter `0` and `0`
4. The account will be instantly verified
