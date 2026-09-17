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

function corsHeaders(origin: string | null) {
  const allowed =
    !origin ||
    origin.includes('lurvox.in') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : 'https://www.lurvox.in',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get('origin'))

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
    return NextResponse.json({ reply: result.text.trim() }, { headers })
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
