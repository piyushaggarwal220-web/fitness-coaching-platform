import { NextResponse } from 'next/server'
import { buildExportDataset, exportToCsv, exportToXlsx } from '@/lib/admin/exports'
import type { ExportType } from '@/lib/admin/exports'
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
  const type = (searchParams.get('type') ?? 'purchases') as ExportType
  const format = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'

  const allowed: ExportType[] = ['purchases', 'revenue', 'ai-costs', 'customers']
  if (!allowed.includes(type)) {
    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
  }

  const dataset = await buildExportDataset(type)
  const timestamp = new Date().toISOString().slice(0, 10)

  if (format === 'xlsx') {
    const buffer = exportToXlsx(dataset.headers, dataset.rows)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${dataset.filename}-${timestamp}.xlsx"`,
      },
    })
  }

  const csv = exportToCsv(dataset.headers, dataset.rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dataset.filename}-${timestamp}.csv"`,
    },
  })
}
