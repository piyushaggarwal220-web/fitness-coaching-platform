import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  type InitialPlanGenerationJob,
} from '@/lib/initial-plan-generation'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { jobId?: string } | null
  if (!body?.jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  const { data: coach } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach access required' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .eq('id', body.jobId)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'Generation job not found' }, { status: 404 })

  const queued = await retryInitialPlanGeneration(admin, data as InitialPlanGenerationJob)
  if (!queued) {
    return NextResponse.json({ error: 'Only failed generation jobs can be retried' }, { status: 409 })
  }

  after(() =>
    processInitialPlanGeneration(queued.id).catch((err) => {
      console.error(
        '[coach/plan-generation/retry] background generation failed:',
        err instanceof Error ? err.message : err
      )
    })
  )
  return NextResponse.json({ success: true, status: queued.status }, { status: 202 })
}
