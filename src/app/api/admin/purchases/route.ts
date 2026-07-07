import { NextResponse } from 'next/server'
import { listPurchases } from '@/lib/admin/business-analytics'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const result = await listPurchases({
    search: searchParams.get('search') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    sort: (searchParams.get('sort') as 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | null) ?? 'date_desc',
    page: Number(searchParams.get('page') ?? '1'),
    pageSize: Number(searchParams.get('pageSize') ?? '25'),
  })

  return NextResponse.json(result)
}
