import { NextResponse } from 'next/server'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ORIGINS = new Set(['https://www.lurvox.in', 'https://lurvox.in'])
const MAX_SUBMISSIONS = 2

type TalkToCoachBody = {
  name?: string
  email?: string
  phone?: string
  message?: string
}

function corsHeaders(origin: string | null): HeadersInit {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  }
  return {}
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function buildFingerprint(email: string, phone: string): string {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhoneForWhatsApp(phone) ?? phone.replace(/\D/g, '')
  return `${normalizedEmail}|${normalizedPhone}`.toLowerCase()
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)

  let body: TalkToCoachBody
  try {
    body = (await request.json()) as TalkToCoachBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400, headers })
  }

  const name = body.name?.trim() ?? ''
  const email = body.email?.trim() ?? ''
  const phone = body.phone?.trim() ?? ''
  const message = body.message?.trim() ?? ''

  if (!name || name.length < 2) {
    return NextResponse.json({ ok: false, error: 'Please enter your name.' }, { status: 400, headers })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400, headers })
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid phone number.' }, { status: 400, headers })
  }
  if (!message || message.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'Please share a bit more about what you need help with.' },
      { status: 400, headers }
    )
  }

  const fingerprint = buildFingerprint(email, phone)
  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('talk_to_coach_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('fingerprint', fingerprint)

  if (countError) {
    console.error('[talk-to-a-coach] count failed:', countError)
    return NextResponse.json(
      { ok: false, error: 'Could not process your request. Please try again.' },
      { status: 500, headers }
    )
  }

  const priorCount = count ?? 0
  if (priorCount >= MAX_SUBMISSIONS) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'You have already submitted the maximum number of consultation requests (2). Please WhatsApp us at +91 92204 51577 if you need further help.',
        remaining: 0,
      },
      { status: 403, headers }
    )
  }

  const { error: insertError } = await admin.from('talk_to_coach_submissions').insert({
    name,
    email: normalizeEmail(email),
    phone,
    message,
    fingerprint,
  })

  if (insertError) {
    console.error('[talk-to-a-coach] insert failed:', insertError)
    return NextResponse.json(
      { ok: false, error: 'Could not save your request. Please try again.' },
      { status: 500, headers }
    )
  }

  const remaining = Math.max(0, MAX_SUBMISSIONS - priorCount - 1)

  return NextResponse.json({ ok: true, remaining }, { status: 200, headers })
}
