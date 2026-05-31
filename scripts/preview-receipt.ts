#!/usr/bin/env tsx
/**
 * Renders the receipt email template with sample data to
 * email-templates/receipt-preview.html so you can open it in a browser.
 *
 * Run: npx tsx scripts/preview-receipt.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderReceiptEmail } from '../lib/email'

const { subject, html } = renderReceiptEmail({
  tenantName: 'Moiz Qureshi',
  tenantEmail: 'moiz@example.com',
  amount: 2400,
  invoiceId: 'in_1Td2SBB1sQgX6zOhGLiLPM5M',
  paidDate: new Date('2026-06-01T00:00:00Z'),
  propertyAddress: '1234 Maple Street',
  propertyUnit: 'A',
  paymentMethodType: 'us_bank_account',
  paymentMethodLast4: '8648',
})

mkdirSync('email-templates', { recursive: true })
writeFileSync('email-templates/receipt-preview.html', html)
console.log(`Subject: ${subject}`)
console.log('Wrote email-templates/receipt-preview.html')
