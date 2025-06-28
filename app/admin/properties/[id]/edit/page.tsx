import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import EditPropertyForm from './EditPropertyForm'

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()
    const { id } = await params

    // Get property details
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !property) {
      redirect('/admin/properties')
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        <EditPropertyForm property={property} />
      </div>
    )
  } catch (error) {
    redirect('/auth/login')
  }
}
