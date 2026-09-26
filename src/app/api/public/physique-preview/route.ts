import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import OpenAI, { toFile } from 'openai'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  PHYSIQUE_PREVIEW_MAX_BYTES,
  PHYSIQUE_PREVIEW_PLANS,
  isPhysiquePreviewPlan,
  isVisitorId,
  parseSafetyDecision,
  physiquePreviewDay,
  physiquePreviewPrompt,
  sniffPreviewMediaType,
  type PhysiquePreviewPlanSlug,
} from '@/lib/physique-preview'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_ORIGINS = new Set([
  'https://www.lurvox.in',
  'https://lurvox.in',
  'https://app.lurvox.in',
  'https://9uwyq1-0j.myshopify.com',
])

const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS_PER_WINDOW = 8
const ipBuckets = new Map<string, { windowStart: number; count: number }>()

const SAFETY_PROMPT = [
  'Look at this photo. Reply with exactly one word: allow or refuse.',
  'allow only when it shows one adult, age 18 or older, and is suitable for a modest fitness preview.',
  'refuse for anyone who looks under 18, nudity, sexual content, more than one person, no person, or if you are unsure.',
].join(' ')

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (origin && (ALLOWED_ORIGINS.has(origin) || isDevOrigin(origin))) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function isDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

function originAllowed(origin: string | null): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin) || isDevOrigin(origin)
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function takeAttempt(ip: string): boolean {
  const now = Date.now()
  let bucket = ipBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, count: 0 }
  }
  if (bucket.count >= MAX_ATTEMPTS_PER_WINDOW) {
    ipBuckets.set(ip, bucket)
    return false
  }
  bucket.count += 1
  ipBuckets.set(ip, bucket)
  if (ipBuckets.size > 5000) {
    const cutoff = now - WINDOW_MS * 2
    for (const [key, value] of ipBuckets) {
      if (value.windowStart < cutoff) ipBuckets.delete(key)
    }
  }
  return true
}

function visitorKey(visitorId: string): string {
  return createHash('sha256').update(`lurvox-physique-v1|${visitorId}`).digest('hex')
}

async function reservePreview(visitorKeyHash: string, day: string, plan: PhysiquePreviewPlanSlug) {
  const admin = createAdminClient()
  const { error } = await admin.from('physique_preview_uses').insert({
    visitor_key: visitorKeyHash,
    used_on: day,
    plan_slug: plan,
  })
  if (!error) return 'ok' as const
  if (error.code === '23505') return 'used' as const
  console.error('[physique-preview] could not reserve', error.code)
  return 'unavailable' as const
}

async function releasePreview(visitorKeyHash: string, day: string) {
  try {
    const admin = createAdminClient()
    await admin.from('physique_preview_uses').delete().eq('visitor_key', visitorKeyHash).eq('used_on', day)
  } catch (error) {
    console.error('[physique-preview] could not release a failed preview', error)
  }
}

async function photoIsAllowed(bytes: Buffer, mediaType: 'image/jpeg' | 'image/png' | 'image/webp') {
  const result = await generateOpenAIResponse({
    systemPrompt: 'You only classify photos. Reply with one word.',
    userPrompt: SAFETY_PROMPT,
    model: MODELS.GPT_LUNA,
    maxTokens: 16,
    images: [{ mediaType, data: bytes.toString('base64') }],
  })
  return parseSafetyDecision(result.text) === 'allow'
}

async function editPhysique(bytes: Buffer, mediaType: string, plan: PhysiquePreviewPlanSlug) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 })
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'
  const image = await toFile(bytes, 'preview.jpg', { type: mediaType })
  const response = await client.images.edit({
    model,
    image,
    prompt: physiquePreviewPrompt(plan),
    size: '1024x1536',
    quality: 'medium',
    input_fidelity: 'high',
    n: 1,
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('Image model returned no picture')
  return b64
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  if ((process.env.PHYSIQUE_PREVIEW_ENABLED || '').trim().toLowerCase() !== 'true') {
    return NextResponse.json({ error: 'This preview is paused.' }, { status: 503, headers })
  }
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: 'This preview is only available on Lurvox.' }, { status: 403, headers })
  }
  if (!takeAttempt(clientIp(request))) {
    return NextResponse.json(
      { error: 'Too many tries from this connection. Wait a few minutes and try once more.' },
      { status: 429, headers }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Upload a photo and pick a plan.' }, { status: 400, headers })
  }

  const planRaw = String(form.get('plan') ?? '')
  const visitorId = String(form.get('visitorId') ?? '')
  const adult = String(form.get('adult') ?? '')
  const file = form.get('photo')

  if (adult !== 'yes') {
    return NextResponse.json({ error: 'Confirm you are 18 or older and this photo is you.' }, { status: 400, headers })
  }
  if (!isPhysiquePreviewPlan(planRaw)) {
    return NextResponse.json({ error: 'Pick Fat loss, Fat loss + muscle, or Athletic body.' }, { status: 400, headers })
  }
  if (!isVisitorId(visitorId)) {
    return NextResponse.json({ error: 'Refresh the page and try again.' }, { status: 400, headers })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a photo first.' }, { status: 400, headers })
  }
  if (file.size > PHYSIQUE_PREVIEW_MAX_BYTES) {
    return NextResponse.json({ error: 'That photo is too large. Use one under 4 MB.' }, { status: 413, headers })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const mediaType = sniffPreviewMediaType(bytes)
  if (!mediaType) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, or WebP photo.' }, { status: 400, headers })
  }

  let allowed = false
  try {
    allowed = await photoIsAllowed(bytes, mediaType)
  } catch (error) {
    console.error('[physique-preview] safety check failed', error instanceof Error ? error.message : 'error')
    return NextResponse.json(
      { error: 'We could not check this photo. Try again in a moment.' },
      { status: 503, headers }
    )
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'Use a normal photo of yourself, age 18 or older, in everyday clothes.' },
      { status: 400, headers }
    )
  }

  const day = physiquePreviewDay()
  const key = visitorKey(visitorId)
  const reserved = await reservePreview(key, day, planRaw)
  if (reserved === 'used') {
    return NextResponse.json(
      { error: 'You have already used today’s preview. It resets tomorrow.' },
      { status: 429, headers }
    )
  }
  if (reserved === 'unavailable') {
    return NextResponse.json(
      { error: 'Previews are not available right now. Try again shortly.' },
      { status: 503, headers }
    )
  }

  try {
    const b64 = await editPhysique(bytes, mediaType, planRaw)
    const plan = PHYSIQUE_PREVIEW_PLANS[planRaw]
    return NextResponse.json(
      {
        image: `data:image/png;base64,${b64}`,
        plan: plan.name,
        price: plan.price,
        checkoutUrl: plan.checkoutUrl,
      },
      { headers }
    )
  } catch (error) {
    await releasePreview(key, day)
    console.error('[physique-preview] image edit failed', error instanceof Error ? error.message : 'error')
    return NextResponse.json(
      { error: 'We could not make the preview. You can try once more.' },
      { status: 502, headers }
    )
  }
}
