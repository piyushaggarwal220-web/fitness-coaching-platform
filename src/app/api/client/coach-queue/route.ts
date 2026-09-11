import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { loadClientCoachQueueView } from '@/lib/client-coach-queue-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureWeeklyCallForClient } from '@/lib/weekly-call-schedule'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()

  try {
    await ensureWeeklyCallForClient(admin, auth.user.id)
  } catch (err) {
    console.error('[client/coach-queue] auto-book failed', err)
  }

  try {
    const queue = await loadClientCoachQueueView(admin, auth.user.id)
    return NextResponse.json({ success: true, queue })
  } catch (error) {
    console.error('[client/coach-queue] failed to load', error)
    return NextResponse.json(
      { success: false, error: 'Coach queue is temporarily unavailable. Please retry.' },
      { status: 503 }
    )
  }
}
