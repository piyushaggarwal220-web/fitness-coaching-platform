import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  answerLearningQuery,
  getLearningCenterData,
} from '@/lib/jarvis/memory/learning-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  try {
    const learning = await getLearningCenterData()
    return NextResponse.json({ success: true, learning })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load learning center',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { query?: string }
  if (!body.query?.trim()) {
    return NextResponse.json({ success: false, error: 'query required' }, { status: 400 })
  }

  try {
    const result = await answerLearningQuery(body.query.trim())
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Learning query failed',
      },
      { status: 500 }
    )
  }
}
