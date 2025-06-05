export interface User {
  id: string
  email: string
  role: 'admin' | 'tenant'
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  user_id: string
  first_name: string
  last_name: string
  phone: string
  property_id: string | null
  payment_due_day: number
  created_at: string
  updated_at: string
  user?: User
  property?: Property
}

export interface Property {
  id: string
  address: string
  unit_number?: string
  rent_amount: number
  created_at: string
  updated_at: string
}

export interface PaymentMethod {
  id: string
  tenant_id: string
  stripe_payment_method_id: string
  type: 'card' | 'us_bank_account'
  last4: string
  is_default: boolean
  created_at: string
}

export interface Payment {
  id: string
  tenant_id: string
  property_id: string
  amount: number
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  stripe_payment_intent_id?: string
  payment_method_id: string
  due_date: string
  paid_at?: string
  created_at: string
  updated_at: string
  tenant?: Tenant
  property?: Property
  payment_method?: PaymentMethod
}

export interface AutoPayment {
  id: string
  tenant_id: string
  payment_method_id: string
  day_of_month: number
  is_active: boolean
  created_at: string
  updated_at: string
  tenant?: Tenant
  payment_method?: PaymentMethod
} 