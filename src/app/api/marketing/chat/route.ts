import { NextResponse } from 'next/server'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'

export const runtime = 'nodejs'
export const maxDuration = 30

type ChatTurn = { role: 'user' | 'assistant'; content: string }

const INSTANT_SYSTEM = `You are Lurvox Instant Plan help on app.lurvox.in/customised-plan.
Product: one-time customised digital plans (Workout ₹49, Diet ₹89, Complete ₹99).
Delivery: after pay, short in-app questionnaire, plan in app + email within a few hours. Written guidance, not live chat coaching.
Guarantee: moneyback if no results when they follow the plan.
Tone: short, clear, India-friendly English. No medical advice. Do not invent discounts.
Never say you are an AI model name. Never push lurvox.in coaching membership unless they ask about live check-ins.
Max 3 short sentences unless they ask for detail.`

const COACHING_SYSTEM = `You are Lurvox coaching help for www.lurvox.in.
Product: affordable 1-to-1 online fitness coaching. Plans: Fat loss 3 months ₹599, Fat loss + muscle 6 months ₹999, Athletic body 12 months ₹1,699.
Positioning: personalised online coaching with guarantee of visible results when they follow the plan. Do not say "AI", "human coach", or "chatbot". Say 1-to-1 coaching, personalised plans, check-ins, app support.
Tone: short, clear, India-friendly English. No medical advice. No fake urgency.
Max 3 short sentences unless they ask for detail.`

const MAX_HISTORY = 8
const MAX_MESSAGE_LEN = 500
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 8
const MAX_PER_DAY = 40

const ALLOWED_ORIGINS = new Set([
  'https://www.lurvox.in',
  'https://lurvox.in',
  'https://app.lurvox.in',
])

type Bucket = { windowStart: number; windowCount: number; dayKey: string; dayCount: number }
const ipBuckets = new Map<string, Bucket>()

function isDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (isDevOrigin(origin)) return origin
  return null
}

function corsHeaders(origin: string | null, allowed: boolean) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function takeRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const dayKey = new Date().toISOString().slice(0, 10)
  let bucket = ipBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, windowCount: 0, dayKey, dayCount: bucket?.dayKey === dayKey ? bucket.dayCount : 0 }
  }
  if (bucket.dayKey !== dayKey) {
    bucket.dayKey = dayKey
    bucket.dayCount = 0
  }
  if (bucket.dayCount >= MAX_PER_DAY) {
    return { ok: false, retryAfterSec: 3600 }
  }
  if (bucket.windowCount >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000))
    return { ok: false, retryAfterSec }
  }
  bucket.windowCount += 1
  bucket.dayCount += 1
  ipBuckets.set(ip, bucket)

  // Bound memory on long-lived instances
  if (ipBuckets.size > 5000) {
    const cutoff = now - WINDOW_MS * 2
    for (const [key, value] of ipBuckets) {
      if (value.windowStart < cutoff) ipBuckets.delete(key)
    }
  }
  return { ok: true }
}

function faqFallback(surface: 'instant' | 'coaching', message: string): string | null {
  const q = message.toLowerCase()
  if (surface === 'instant') {
    if (/price|cost|₹|rs\b|rupee|49|89|99/.test(q)) {
      return 'Workout is ₹49. Diet is ₹89. Complete Guidance is ₹99 for both, plus sleep, cardio, water, and optional supplements.'
    }
    if (/deliver|how long|when|hours|receive/.test(q)) {
      return 'After payment, finish the short in-app questionnaire. Your plan usually arrives in the app and email within a few hours.'
    }
    if (/money.?back|refund|guarantee|result/.test(q)) {
      return 'We stand behind guaranteed results with moneyback if you see none, when you follow the plan as written.'
    }
  } else {
    if (/price|cost|₹|rs\b|rupee|599|999|1699/.test(q)) {
      return 'Fat loss is ₹599 for 3 months. Fat loss + muscle is ₹999 for 6 months. Athletic body is ₹1,699 for 12 months.'
    }
    if (/1.?to.?1|coach|support|check.?in/.test(q)) {
      return 'Every plan includes personalised workout and diet, check-ins, and 1-to-1 support in the app.'
    }
  }
  return null
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  const allowedOrigin = resolveAllowedOrigin(origin)
  if (!allowedOrigin) {
    return new NextResponse(null, { status: 403 })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(allowedOrigin, true) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const allowedOrigin = resolveAllowedOrigin(origin)
  // Browser calls must send an allowed Origin. Same-origin app calls may omit Origin.
  if (origin && !allowedOrigin) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  const headers = corsHeaders(allowedOrigin, Boolean(allowedOrigin))

  const limited = takeRateLimit(clientIp(request))
  if (!limited.ok) {
    return NextResponse.json(
      { reply: 'Too many questions right now. Please wait a bit, or scroll to the plans section.' },
      {
        status: 429,
        headers: { ...headers, 'Retry-After': String(limited.retryAfterSec) },
      }
    )
  }

  let body: {
    message?: string
    history?: ChatTurn[]
    surface?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  const message = (body.message ?? '').trim().slice(0, MAX_MESSAGE_LEN)
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400, headers })
  }

  const surface = body.surface === 'coaching' ? 'coaching' : 'instant'
  const faq = faqFallback(surface, message)
  if (faq) {
    return NextResponse.json({ reply: faq }, { headers })
  }

  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : []
  const historyBlock = history
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .map((t) => `${t.role === 'user' ? 'Visitor' : 'Assistant'}: ${t.content.trim().slice(0, MAX_MESSAGE_LEN)}`)
    .join('\n')

  const userPrompt = historyBlock
    ? `Earlier:\n${historyBlock}\n\nVisitor now: ${message}`
    : `Visitor: ${message}`

  try {
    const result = await generateOpenAIResponse({
      systemPrompt: surface === 'coaching' ? COACHING_SYSTEM : INSTANT_SYSTEM,
      userPrompt,
      model: MODELS.GPT_LUNA,
      maxTokens: 280,
      temperature: 0.4,
    })
    const reply = result.text.trim()
    if (!reply) {
      throw new Error('Empty marketing chat reply')
    }
    return NextResponse.json({ reply }, { headers })
  } catch (err) {
    console.error('[marketing-chat]', err)
    return NextResponse.json(
      {
        reply:
          surface === 'coaching'
            ? 'Plans start at ₹599 for 3 months. Ask about fat loss, muscle, or Athletic body — or open the plans section on this page.'
            : 'Workout is ₹49, Diet ₹89, Complete ₹99. After payment you answer a short questionnaire and get your plan in the app and email.',
      },
      { headers }
    )
  }
}
