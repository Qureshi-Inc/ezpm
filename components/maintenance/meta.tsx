/**
 * Shared presentation helpers for maintenance requests — category icons,
 * status badge variants, and human labels. Used by both tenant and admin UIs
 * so the vocabulary stays consistent.
 */

import { Droplet, Zap, Refrigerator, Wind, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type MaintenanceCategory = 'plumbing' | 'electrical' | 'appliance' | 'hvac' | 'other'
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'
export type MaintenancePriority = 'normal' | 'urgent'

export const CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'hvac', label: 'Heating / Cooling' },
  { value: 'other', label: 'Something else' },
]

const CATEGORY_ICON: Record<string, LucideIcon> = {
  plumbing: Droplet,
  electrical: Zap,
  appliance: Refrigerator,
  hvac: Wind,
  other: Wrench,
}

export function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? 'Other'
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Wrench
  return <Icon className={className} />
}

export const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

// Maps to the Badge variants added during the UI redesign.
export function statusBadgeVariant(
  status: string,
): 'warning' | 'accent' | 'success' | 'outline' {
  switch (status) {
    case 'in_progress':
      return 'accent'
    case 'resolved':
      return 'success'
    case 'cancelled':
      return 'outline'
    default:
      return 'warning' // open
  }
}
