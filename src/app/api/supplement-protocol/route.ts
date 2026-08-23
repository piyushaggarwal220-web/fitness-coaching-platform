import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { ensureSupplementProtocol, loadSupplementProtocol } from '@/lib/ai/supplement-protocol'
import { parseAddonProtocolId, profileEntitledForAddon } from '@/lib/addon-protocols'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Sonnet write-up on a cold read can take a while. */
export const maxDuration = 300

async function handle(request: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const addonId = parseAddonProtocolId(request.nextUrl.searchParams.get('addon'))
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(
      'supplement_protocol_entitled, anxiety_protocol_entitled, face_maxxing_entitled, onboarding_complete'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profileEntitledForAddon(profile, addonId)) {
    return NextResponse.json({ entitled: false, status: 'none', content: null, addonId })
  }

  if (!profile?.onboarding_complete) {
    return NextResponse.json({
      entitled: true,
      status: 'awaiting_onboarding',
      content: null,
      addonId,
      message: 'Finish your onboarding answers and your protocol will be built from them.',
    })
  }

  const existing = await loadSupplementProtocol(auth.user.id, addonId)
  if (existing?.status === 'ready' && existing.content?.trim()) {
    return NextResponse.json({
      entitled: true,
      status: 'ready',
      content: existing.content,
      version: existing.version,
      generatedAt: existing.generated_at,
      addonId,
    })
  }

  const result = await ensureSupplementProtocol(auth.user.id, addonId)
  if (result.status === 'ready' && result.content) {
    const refreshed = await loadSupplementProtocol(auth.user.id, addonId)
    return NextResponse.json({
      entitled: true,
      status: 'ready',
      content: result.content,
      version: refreshed?.version ?? 1,
      generatedAt: refreshed?.generated_at ?? null,
      addonId,
    })
  }

  return NextResponse.json({
    entitled: true,
    status: result.status === 'failed' ? 'failed' : 'pending',
    content: result.content,
    addonId,
    message:
      'We are still putting your protocol together. Check back shortly, or message your coach if this persists.',
  })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
