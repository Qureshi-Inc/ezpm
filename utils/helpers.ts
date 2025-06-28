import { format } from 'date-fns'

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

export function getPaymentMethodIcon(type: 'card' | 'moov_ach'): string {
  if (type === 'card') return '💳'
  if (type === 'moov_ach') return '🏦'
  return '💰'
}

export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'text-yellow-600 bg-yellow-100',
    processing: 'text-blue-600 bg-blue-100',
    succeeded: 'text-green-600 bg-green-100',
    failed: 'text-red-600 bg-red-100',
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
    // Due date is this month
    dueDate = new Date(currentYear, currentMonth, dayOfMonth)
  } else {
    // Due date is next month
    dueDate = new Date(currentYear, currentMonth + 1, dayOfMonth)
  }
  
  return dueDate
} 