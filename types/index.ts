import type { PaymentMethodType } from '@/utils/payment-fees'

export interface User {
  id: string
  zitadel_subject: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: 'admin' | 'tenant'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  user_id: string | null
  email: string
  first_name: string
  last_name: string
  phone: string | null
  property_id: string | null
  payment_due_day: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
  user?: User
  property?: Property
}

export interface Property {
  id: string
  user_id: string | null
  address: string
  unit_number: string | null
  rent_amount: number
  bedrooms: number | null
  bathrooms: number | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface PaymentMethod {
  id: string
  tenant_id: string
  stripe_payment_method_id: string
  type: PaymentMethodType
  last4: string | null
  bank_name: string | null
  card_brand: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

// A row in `payments` mirrors a Stripe Invoice. Status values are the union
// of Stripe Invoice statuses we care about.
export type PaymentStatus = 'open' | 'processing' | 'succeeded' | 'failed' | 'uncollectible' | 'void'

export interface Payment {
  id: string
  tenant_id: string
  property_id: string | null
  stripe_invoice_id: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  amount: number
  status: PaymentStatus
  payment_method_id: string | null
  due_date: string
  paid_at: string | null
  created_at: string
  updated_at: string
  tenant?: Tenant
  property?: Property
  payment_method?: PaymentMethod
}

export interface StripeEvent {
  event_id: string
  event_type: string
  received_at: string
  processed_at: string | null
  payload: unknown
}

export interface SystemSetting {
  key: string
  value: unknown
  updated_at: string
}
