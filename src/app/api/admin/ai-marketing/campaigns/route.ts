import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()

  const [{ data: campaigns }, { data: adsets }, { data: ads }] = await Promise.all([
    admin
      .from('marketing_campaigns')
      .select('*, marketing_funnels(id, name, slug, price_inr)')
      .order('updated_at', { ascending: false })
      .limit(100),
    admin.from('marketing_adsets').select('*').order('updated_at', { ascending: false }).limit(200),
    admin.from('marketing_ads').select('*').order('updated_at', { ascending: false }).limit(300),
  ])

  return NextResponse.json({
    success: true,
    campaigns: campaigns ?? [],
    adsets: adsets ?? [],
    ads: ads ?? [],
  })
}
