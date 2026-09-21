import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { generateCreativeConcepts } from '@/lib/ai-marketing/agents/creative'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    count?: number
    funnelId?: string
    productId?: string
    audienceHint?: string
    parentCreativeId?: string
    variationMode?: boolean
    generateImages?: boolean
  }

  if (!body.funnelId) {
    return NextResponse.json(
      { success: false, error: 'funnelId is required (₹99 or ₹1,699 funnel, etc.)' },
      { status: 400 }
    )
  }

  const allowed = new Set([5, 10, 20, 50])
  const count = allowed.has(Number(body.count)) ? (Number(body.count) as 5 | 10 | 20 | 50) : 5

  try {
    const result = await generateCreativeConcepts({
      count,
      funnelId: body.funnelId,
      productId: body.productId,
      audienceHint: body.audienceHint,
      parentCreativeId: body.parentCreativeId,
      variationMode: Boolean(body.variationMode),
      generateImages: body.generateImages !== false,
      actorId: auth.user.id,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[ai-marketing/generate-creatives]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
