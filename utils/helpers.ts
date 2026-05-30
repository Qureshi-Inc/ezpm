import { format } from 'date-fns'
import type { PaymentMethodType } from './payment-fees'

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM dd, yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM dd, yyyy h:mm a')
}

export function getPaymentMethodIcon(type: PaymentMethodType): string {
  if (type === 'card') return '💳'
  if (type === 'us_bank_account') return '🏦'
  return '💰'
}

export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: 'text-yellow-600 bg-yellow-100',
    processing: 'text-blue-600 bg-blue-100',
    succeeded: 'text-green-600 bg-green-100',
    failed: 'text-red-600 bg-red-100',
    uncollectible: 'text-red-700 bg-red-200',
    void: 'text-gray-600 bg-gray-100',
  }
  return colors[status] || 'text-gray-600 bg-gray-100'
}

export function generateDueDate(dayOfMonth: number): Date {
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  let dueDate: Date
  if (currentDay <= dayOfMonth) {
    dueDate = new Date(currentYear, currentMonth, dayOfMonth)
  } else {
    dueDate = new Date(currentYear, currentMonth + 1, dayOfMonth)
  }
  return dueDate
}
