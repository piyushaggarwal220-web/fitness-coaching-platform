import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { runMarketingBrain } from '@/lib/ai-marketing/brain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const result = await runMarketingBrain({ actorId: auth.user.id })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Brain failed' },
      { status: 500 }
    )
  }
}
