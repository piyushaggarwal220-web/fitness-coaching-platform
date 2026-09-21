import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { pushCreativeToMeta } from '@/lib/ai-marketing/meta/writes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * After human approval: create the Meta ad creative (idempotent).
 * Does NOT publish/activate ads. Requires META_ADS_* + META_ADS_PAGE_ID.
 */
export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    creativeId?: string
    pageId?: string
    linkUrl?: string
  }

  if (!body.creativeId) {
    return NextResponse.json({ success: false, error: 'creativeId required' }, { status: 400 })
  }

  try {
    const result = await pushCreativeToMeta({
      creativeId: body.creativeId,
      actorId: auth.user.id,
      pageId: body.pageId,
      linkUrl: body.linkUrl,
    })
    return NextResponse.json({
      success: result.ok,
      ...result,
      error: result.error,
    }, { status: result.ok ? 200 : 400 })
  } catch (error) {
    console.error('[ai-marketing/push-creative]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Push failed' },
      { status: 500 }
    )
  }
}
