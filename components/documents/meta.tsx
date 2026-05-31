import { FileText, FileSpreadsheet, Image as ImageIcon } from 'lucide-react'

export const DOC_CATEGORIES = [
  { value: 'lease', label: 'Lease' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'id', label: 'ID' },
  { value: 'income', label: 'Proof of income' },
  { value: 'notice', label: 'Notice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'other', label: 'Other' },
] as const

export type DocCategory = (typeof DOC_CATEGORIES)[number]['value']

export function docCategoryLabel(value: string): string {
  return DOC_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other'
}

export function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function FileGlyph({ contentType, className }: { contentType: string; className?: string }) {
  const t = (contentType || '').toLowerCase()
  if (t.startsWith('image/')) return <ImageIcon className={className} />
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return <FileSpreadsheet className={className} />
  return <FileText className={className} />
}
