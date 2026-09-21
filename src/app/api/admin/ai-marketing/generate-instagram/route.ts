import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { generateInstagramIdeas } from '@/lib/ai-marketing/agents/instagram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as {
    count?: number
    topicHint?: string
  }
  const allowed = new Set([5, 10, 20])
  const count = allowed.has(Number(body.count)) ? (Number(body.count) as 5 | 10 | 20) : 5
  try {
    const result = await generateInstagramIdeas({
      count,
      topicHint: body.topicHint,
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
