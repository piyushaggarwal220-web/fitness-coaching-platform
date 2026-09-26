import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/ai-marketing/auth'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { runJarvisBackgroundCycle } from '@/lib/jarvis/workers/background-cycle'
import { processPendingJarvisEvents } from '@/lib/jarvis/workers/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const budgets = await getJarvisBudgets()
    if (!budgets.background_enabled) {
      return NextResponse.json({ success: true, paused: true })
    }
    const events = await processPendingJarvisEvents(10)
    const result = await runJarvisBackgroundCycle()
    return NextResponse.json({ success: true, result, events })
  } catch (error) {
    console.error('[cron/jarvis-cycle]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
