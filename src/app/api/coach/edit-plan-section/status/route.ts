import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Matches route maxDuration (300s) plus a short buffer for the completion log. */
const GENERATING_STALE_MS = 6 * 60 * 1000

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) return NextResponse.json({ error: 'Coach access required' }, { status: 403 })

  const clientId = request.nextUrl.searchParams.get('clientId')?.trim()
  const section = request.nextUrl.searchParams.get('section')?.trim()
  if (!clientId || (section !== 'nutrition' && section !== 'workout' && section !== 'cardio')) {
    return NextResponse.json({ error: 'clientId and section are required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('ai_generation_logs')
    .select('action, success, validation_result, rendered_output, created_at')
    .eq('client_id', clientId)
    .in('action', ['coach_section_edit', 'coach_section_edit_started'])
    .order('created_at', { ascending: false })
    .limit(20)

  const row = (data ?? []).find((entry) => {
    const output = entry.rendered_output as { section?: string } | null
    return output?.section === section
  })

  if (!row) return NextResponse.json({ status: 'idle' })

  const output = (row.rendered_output ?? {}) as {
    revisedText?: string
    summary?: string
    error?: string
    phase?: string
  }

  if (row.action === 'coach_section_edit_started' || row.validation_result === 'started') {
    const startedAt = Date.parse(row.created_at)
    if (Number.isFinite(startedAt) && Date.now() - startedAt > GENERATING_STALE_MS) {
      return NextResponse.json({
        status: 'failed',
        error: 'The rewrite timed out in the background. Try again.',
        completedAt: row.created_at,
      })
    }
    return NextResponse.json({ status: 'generating', startedAt: row.created_at })
  }
  if (!row.success) {
    return NextResponse.json({
      status: 'failed',
      error: output.error ?? 'AI rewrite failed',
      completedAt: row.created_at,
    })
  }
  return NextResponse.json({
    status: 'ready',
    revisedText: output.revisedText ?? '',
    summary: output.summary ?? null,
    completedAt: row.created_at,
  })
}
