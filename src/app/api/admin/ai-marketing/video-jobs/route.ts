import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createVideoEditJob } from '@/lib/ai-marketing/workflows/video-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('video_edit_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, jobs: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json()) as {
    sourceVideo?: string
    instructions?: Record<string, unknown>
  }
  if (!body.sourceVideo) {
    return NextResponse.json({ success: false, error: 'sourceVideo required' }, { status: 400 })
  }
  try {
    const job = await createVideoEditJob({
      sourceVideo: body.sourceVideo,
      instructions: body.instructions,
      actorId: auth.user.id,
    })
    return NextResponse.json({ success: true, job })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
