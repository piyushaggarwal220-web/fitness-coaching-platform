import { NextResponse } from 'next/server'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import {
  EXISTING_PLAN_CALL_BLOCK_MESSAGE,
  existingPlanBlocksConsultation,
} from '@/lib/talk-to-coach-existing-plan'
import {
  buildClientCallConfirmation,
  isClientEmail,
} from '@/lib/talk-to-coach-confirmation'

const ALLOWED_ORIGINS = new Set([
  'https://www.lurvox.in',
  'https://lurvox.in',
  'https://app.lurvox.in',
])
const MAX_SUBMISSIONS = 2
const NOTIFY_TO =
  process.env.TALK_TO_COACH_NOTIFY_EMAIL?.trim() || 'piyushfitness44@gmail.com'

type TalkToCoachBody = {
  name?: string
  email?: string
  phone?: string
  gender?: string
  message?: string
  preferredTime?: string
}

const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
}

const COACH_CALL_TIME_SLOTS = new Set([
  '11:30 am–12:30 pm IST',
  '11:30–12:30 pm IST',
  '5–6 pm IST',
  '6–7 pm IST',
  '7–8 pm IST',
  '8–9 pm IST',
])

const LEGACY_PREFERRED_TIME_OPTIONS = new Set([
  ...COACH_CALL_TIME_SLOTS,
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

function buildFingerprint(phone: string): string {
  const normalizedPhone = normalizePhoneForWhatsApp(phone) ?? phone.replace(/\D/g, '')
  return normalizedPhone.toLowerCase()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeGender(value: string | undefined): string | null {
  const raw = value?.trim() ?? ''
  if (!raw) return null
  return GENDER_LABELS[raw.toLowerCase()] ?? null
}

function withGenderLine(message: string, gender: string | null): string {
  if (!gender || /(^|\n)Gender:\s/i.test(message)) return message
  return `Gender: ${gender}\n${message}`
}

function buildNotifyEmail(input: {
  name: string
  phone: string
  message: string
  preferredTime: string | null
  gender: string | null
}) {
  const subject = `New consultation request — ${input.name}`
  const textLines = [
    'New free consultation request from lurvox.in',
    '',
    `Name: ${input.name}`,
    `Phone / WhatsApp: ${input.phone}`,
  ]
  if (input.gender) {
    textLines.push(`Gender: ${input.gender}`)
  }
  if (input.preferredTime) {
    textLines.push(`Preferred call time: ${input.preferredTime}`)
  }
  textLines.push('', 'Goal / message:', input.message, '', 'Call or WhatsApp this person to schedule the consultation.')
  const text = textLines.join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px;font-size:18px">New free consultation request</h2>
      <p style="margin:0 0 16px;color:#555">From lurvox.in consultation form</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:8px 0;font-weight:600;width:140px">Name</td><td style="padding:8px 0">${escapeHtml(input.name)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Phone / WhatsApp</td><td style="padding:8px 0">${escapeHtml(input.phone)}</td></tr>
        ${input.gender ? `<tr><td style="padding:8px 0;font-weight:600">Gender</td><td style="padding:8px 0">${escapeHtml(input.gender)}</td></tr>` : ''}
        ${input.preferredTime ? `<tr><td style="padding:8px 0;font-weight:600">Preferred call time</td><td style="padding:8px 0">${escapeHtml(input.preferredTime)}</td></tr>` : ''}
      </table>
      <div style="margin-top:16px;padding:14px 16px;background:#f6f6f6;border-radius:10px;white-space:pre-wrap">${escapeHtml(input.message)}</div>
      <p style="margin:16px 0 0;color:#555;font-size:13px">Call or WhatsApp this person to schedule the consultation.</p>
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
  const genderRaw = body.gender?.trim() ?? ''
  const gender = normalizeGender(genderRaw)
  const explicitPreferredTime =
    body.preferredTime?.trim() && LEGACY_PREFERRED_TIME_OPTIONS.has(body.preferredTime.trim())
      ? body.preferredTime.trim()
      : null

  if (!name || name.length < 2) {
    return NextResponse.json({ ok: false, error: 'Please enter your name.' }, { status: 400, headers })
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid phone number.' }, { status: 400, headers })
  }
  if (genderRaw && !gender) {
    return NextResponse.json({ ok: false, error: 'Please pick your gender.' }, { status: 400, headers })
  }
  if (!message || message.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'Please share a bit more about what you need help with.' },
      { status: 400, headers }
    )
  }
  if (
    body.preferredTime?.trim() &&
    !LEGACY_PREFERRED_TIME_OPTIONS.has(body.preferredTime.trim())
  ) {
    return NextResponse.json(
      { ok: false, error: 'Invalid preferred call time.' },
      { status: 400, headers }
    )
  }

  const fingerprint = buildFingerprint(phone)
  const admin = createAdminClient()

  const planCheck = await existingPlanBlocksConsultation(admin, {
    phone,
    email: email.includes('@') ? email : null,
  })
  if (!planCheck.ok) {
    console.error('[talk-to-a-coach] existing plan check failed:', planCheck.error)
    return NextResponse.json(
      { ok: false, error: 'Could not process your request. Please try again.' },
      { status: 500, headers }
    )
  }
  if (planCheck.blocked) {
    return NextResponse.json(
      { ok: false, error: EXISTING_PLAN_CALL_BLOCK_MESSAGE, code: 'existing_plan' },
      { status: 403, headers }
    )
  }

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

  const messageWithGender = withGenderLine(message, gender)
  const storedMessage = explicitPreferredTime
    ? `Preferred call time: ${explicitPreferredTime}\n\n${messageWithGender}`
    : messageWithGender
  const { error: insertError } = await admin.from('talk_to_coach_submissions').insert({
    name,
    email: email.includes('@') ? email : null,
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
    phone,
    message: messageWithGender,
    preferredTime: explicitPreferredTime,
    gender,
  })
  const clientEmail = isClientEmail(email) ? email : null
  const confirmation = clientEmail
    ? buildClientCallConfirmation({
        name,
        preferredTime: explicitPreferredTime,
        message,
      })
    : null
  const [clientEmailed, emailed] = await Promise.all([
    confirmation && clientEmail
      ? sendDirectEmail({
          to: clientEmail,
          replyTo: NOTIFY_TO,
          subject: confirmation.subject,
          text: confirmation.text,
          html: confirmation.html,
        })
      : Promise.resolve(null),
    sendDirectEmail({
      to: NOTIFY_TO,
      subject: notify.subject,
      text: notify.text,
      html: notify.html,
    }),
  ])
  if (clientEmailed && !clientEmailed.ok) {
    console.error('[talk-to-a-coach] client confirmation email failed:', clientEmailed.error)
  } else if (clientEmailed?.skipped) {
    console.warn('[talk-to-a-coach] client confirmation email skipped: email provider not configured')
  }
  if (!emailed.ok) {
    console.error('[talk-to-a-coach] notify email failed:', emailed.error)
  } else if (emailed.skipped) {
    console.warn('[talk-to-a-coach] notify email skipped: email provider not configured')
  }

  const remaining = Math.max(0, MAX_SUBMISSIONS - priorCount - 1)

  return NextResponse.json({ ok: true, remaining }, { status: 200, headers })
}
