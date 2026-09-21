import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { generateUgcConcepts } from '@/lib/ai-marketing/agents/ugc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as {
    count?: number
    personaHint?: string
    painPoint?: string
  }
  try {
    const result = await generateUgcConcepts({
      count: body.count ?? 5,
      personaHint: body.personaHint,
      painPoint: body.painPoint,
      actorId: auth.user.id,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
