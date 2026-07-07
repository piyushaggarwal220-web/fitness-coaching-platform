import { NextResponse } from 'next/server'
import { isDebugAiEnabled } from '@/lib/ai/trace-log'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { AiGenerationLogWithRelations } from '@/types/database'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params
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

  const { data, error } = await supabase
    .from('ai_generation_logs')
    .select(
      '*, profiles:client_id(name, email), coaches:coach_id(name)'
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  }

  const log = data as AiGenerationLogWithRelations
  const debugMode = isDebugAiEnabled()

  return NextResponse.json({
    log: {
      ...log,
      raw_output: debugMode ? log.raw_output : null,
      rendered_output: debugMode ? log.rendered_output : null,
    },
    debugMode,
  })
}
