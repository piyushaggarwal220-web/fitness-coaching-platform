import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { ensureSupplementProtocol, loadSupplementProtocol } from '@/lib/ai/supplement-protocol'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Sonnet write-up on a cold read can take a while. */
export const maxDuration = 300

/**
 * The client's paid supplement protocol. Generates on first read if it does not exist yet, so a
 * failed background job can never leave a paying client with nothing.
 */
export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('supplement_protocol_entitled, onboarding_complete')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.supplement_protocol_entitled) {
    return NextResponse.json({ entitled: false, status: 'none', content: null })
  }

  if (!profile.onboarding_complete) {
    return NextResponse.json({
      entitled: true,
      status: 'awaiting_onboarding',
      content: null,
      message: 'Finish your onboarding answers and your protocol will be built from them.',
    })
  }

  const existing = await loadSupplementProtocol(auth.user.id)
  if (existing?.status === 'ready' && existing.content?.trim()) {
    return NextResponse.json({
      entitled: true,
      status: 'ready',
      content: existing.content,
      version: existing.version,
      generatedAt: existing.generated_at,
    })
  }

  const result = await ensureSupplementProtocol(auth.user.id)
  if (result.status === 'ready' && result.content) {
    const refreshed = await loadSupplementProtocol(auth.user.id)
    return NextResponse.json({
      entitled: true,
      status: 'ready',
      content: result.content,
      version: refreshed?.version ?? 1,
      generatedAt: refreshed?.generated_at ?? null,
    })
  }

  return NextResponse.json({
    entitled: true,
    status: result.status === 'failed' ? 'failed' : 'pending',
    content: result.content,
    message:
      'We are still putting your protocol together. Check back shortly, or message your coach if this persists.',
  })
}

/** Manual retry from the client page when generation previously failed. */
export async function POST() {
  return GET()
}
