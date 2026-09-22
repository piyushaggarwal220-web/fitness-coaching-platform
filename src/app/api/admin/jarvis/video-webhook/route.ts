import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import {
  completeVideoJobFromWebhook,
  handleShotstackWebhookPayload,
} from '@/lib/ai-marketing/workflows/video-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Shotstack / video provider webhook (server-to-server).
 *
 * IMPORTANT:
 * - No admin/browser session auth — Shotstack cannot send cookies.
 * - Auth is VIDEO_EDIT_WEBHOOK_SECRET via ?token= / x-jarvis-video-secret / Bearer.
 * - Completion is NEVER trusted from the payload alone — Shotstack render ID is
 *   re-verified via the Shotstack API before mutating video_edit_jobs.
 * - Idempotent. Never publishes to Instagram. Never logs secrets.
 *
 * Production URL: https://app.lurvox.in/api/admin/jarvis/video-webhook
 * (www.lurvox.in is Shopify — do not use for this route.)
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. Use POST.' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.VIDEO_EDIT_WEBHOOK_SECRET?.trim()

  // When secret is configured, reject unauthenticated callbacks (production expectation).
  if (secret) {
    const provided =
      url.searchParams.get('token') ||
      request.headers.get('x-jarvis-video-secret') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      null
    if (!secretsMatch(provided, secret)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    // Fail closed in production if secret is missing — do not accept open webhooks.
    return NextResponse.json(
      { success: false, error: 'Webhook secret not configured' },
      { status: 503 }
    )
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Shotstack native payload — must re-verify via provider API
  if (body.type === 'edit' || body.type === 'serve' || (body.id && body.status && !body.job_id)) {
    const result = await handleShotstackWebhookPayload({
      type: typeof body.type === 'string' ? body.type : undefined,
      action: typeof body.action === 'string' ? body.action : undefined,
      id: typeof body.id === 'string' ? body.id : undefined,
      render: typeof body.render === 'string' ? body.render : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      url: typeof body.url === 'string' ? body.url : null,
      error: typeof body.error === 'string' ? body.error : null,
      jarvis_job_id:
        (typeof body.jarvis_job_id === 'string' ? body.jarvis_job_id : null) ||
        url.searchParams.get('jarvis_job_id'),
    })
    return NextResponse.json({
      success: result.ok,
      duplicate: result.duplicate ?? false,
      status: result.status ?? null,
      error: result.error ?? null,
      published: false,
    })
  }

  // Legacy Jarvis webhook shape — still requires secret (checked above) and
  // verifiedByProvider only when secret was present (never blind trust in prod).
  if (!secret && process.env.VIDEO_EDIT_PROVIDER === 'shotstack') {
    return NextResponse.json(
      { success: false, error: 'Unrecognized payload for Shotstack webhook' },
      { status: 400 }
    )
  }

  const jobId = typeof body.job_id === 'string' ? body.job_id : null
  const status = typeof body.status === 'string' ? body.status : null
  if (!jobId || !status) {
    return NextResponse.json({ success: false, error: 'job_id and status required' }, { status: 400 })
  }

  // Legacy path: only accept when secret verified; still no Instagram publish
  const result = await completeVideoJobFromWebhook({
    jobId,
    providerJobId: typeof body.provider_job_id === 'string' ? body.provider_job_id : null,
    status: status as
      | 'queued'
      | 'analyzing'
      | 'editing'
      | 'rendering'
      | 'processing'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'paused_budget'
      | 'review_required'
      | 'awaiting_approval',
    outputVideo: typeof body.output_video === 'string' ? body.output_video : null,
    outputVariants: body.output_variants,
    transcript: typeof body.transcript === 'string' ? body.transcript : null,
    analysis: body.analysis,
    editPlan: body.edit_plan,
    error: typeof body.error === 'string' ? body.error : null,
    cropStrategy: typeof body.crop_strategy === 'string' ? body.crop_strategy : null,
    verifiedByProvider: Boolean(secret),
  })

  return NextResponse.json({
    success: result.ok,
    duplicate: result.duplicate,
    status: result.status,
    error: result.error,
    published: false,
  })
}
