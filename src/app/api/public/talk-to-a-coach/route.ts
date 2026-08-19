import { NextResponse } from 'next/server'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDirectEmail } from '@/lib/notifications/email-provider'

const ALLOWED_ORIGINS = new Set(['https://www.lurvox.in', 'https://lurvox.in'])
const MAX_SUBMISSIONS = 2
const NOTIFY_TO =
  process.env.TALK_TO_COACH_NOTIFY_EMAIL?.trim() || 'piyushfitness44@gmail.com'

type TalkToCoachBody = {
  name?: string
  email?: string
  phone?: string
  message?: string
  preferredTime?: string
}

const PREFERRED_TIME_OPTIONS = new Set([
  'Morning (9am–12pm)',
  'Afternoon (12pm–5pm)',
  'Evening (5pm–9pm)',
  'Anytime today',
  'Tomorrow',
])

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildNotifyEmail(input: {
  name: string
  email: string
  phone: string
  message: string
  preferredTime: string
}) {
  const subject = `New consultation request — ${input.name}`
  const text = [
    'New free consultation request from lurvox.in',
    '',
    `Name: ${input.name}`,
    `Phone / WhatsApp: ${input.phone}`,
    `Email: ${input.email}`,
    `Preferred call time: ${input.preferredTime}`,
    '',
    'Goal / message:',
    input.message,
    '',
    'Reply to this person by email or WhatsApp to schedule the call.',
  ].join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px;font-size:18px">New free consultation request</h2>
      <p style="margin:0 0 16px;color:#555">From lurvox.in consultation form</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:8px 0;font-weight:600;width:140px">Name</td><td style="padding:8px 0">${escapeHtml(input.name)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Phone / WhatsApp</td><td style="padding:8px 0">${escapeHtml(input.phone)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Email</td><td style="padding:8px 0"><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Preferred call time</td><td style="padding:8px 0">${escapeHtml(input.preferredTime)}</td></tr>
      </table>
      <div style="margin-top:16px;padding:14px 16px;background:#f6f6f6;border-radius:10px;white-space:pre-wrap">${escapeHtml(input.message)}</div>
      <p style="margin:16px 0 0;color:#555;font-size:13px">Reply by email or WhatsApp to schedule the call.</p>
    </div>
  `

  return { subject, text, html }
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
  const preferredTime = body.preferredTime?.trim() ?? ''

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
  if (!preferredTime || !PREFERRED_TIME_OPTIONS.has(preferredTime)) {
    return NextResponse.json(
      { ok: false, error: 'Please pick a preferred call time.' },
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

  const normalizedEmail = normalizeEmail(email)
  const storedMessage = `Preferred call time: ${preferredTime}\n\n${message}`
  const { error: insertError } = await admin.from('talk_to_coach_submissions').insert({
    name,
    email: normalizedEmail,
    phone,
    message: storedMessage,
    fingerprint,
  })

  if (insertError) {
    console.error('[talk-to-a-coach] insert failed:', insertError)
    return NextResponse.json(
      { ok: false, error: 'Could not save your request. Please try again.' },
      { status: 500, headers }
    )
  }

  const notify = buildNotifyEmail({
    name,
    email: normalizedEmail,
    phone,
    message,
    preferredTime,
  })
  const emailed = await sendDirectEmail({
    to: NOTIFY_TO,
    subject: notify.subject,
    text: notify.text,
    html: notify.html,
    replyTo: normalizedEmail,
  })
  if (!emailed.ok) {
    console.error('[talk-to-a-coach] notify email failed:', emailed.error)
  } else if (emailed.skipped) {
    console.warn('[talk-to-a-coach] notify email skipped: email provider not configured')
  }

  const remaining = Math.max(0, MAX_SUBMISSIONS - priorCount - 1)

  return NextResponse.json({ ok: true, remaining }, { status: 200, headers })
}
