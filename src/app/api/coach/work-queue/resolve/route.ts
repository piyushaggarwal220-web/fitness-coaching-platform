import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { resolveWorkQueueTask } from '@/lib/coach-work-queue-resolve'
import type { WorkQueueTask } from '@/lib/coach-work-queue'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { task?: WorkQueueTask } | null
  const task = body?.task
  if (!task?.id || !task?.type) {
    return NextResponse.json({ ok: false, error: 'Task is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach) {
    return NextResponse.json({ ok: false, error: 'Coach access required.' }, { status: 403 })
  }

  const result = await resolveWorkQueueTask(admin, task, coach.id)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, resolved: false, error: result.error ?? 'Could not complete this task.' },
      { status: 400 }
    )
  }

  const { error: completionError } = await admin
    .from('coach_work_queue_completions')
    .upsert(
      {
        coach_id: coach.id,
        task_id: task.id,
        task_type: task.type,
        task_created_at: task.createdAt,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'coach_id,task_id' }
    )

  if (completionError) {
    return NextResponse.json(
      {
        ok: false,
        resolved: result.resolved,
        error: 'Task was completed, but its queue state could not be saved. Please retry.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, resolved: result.resolved })
}
