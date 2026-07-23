import 'server-only'
import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { isEmailConfigured, sendDirectEmail } from '@/lib/notifications/email-provider'
import { shouldBypassPayment } from '@/lib/config'

const OTP_TTL_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 45 * 1000
const MAX_SENDS_PER_CHANNEL = 5
const MAX_VERIFY_ATTEMPTS = 8
/** Marker stored instead of a code hash when Supabase Auth sends the email OTP. */
const SUPABASE_AUTH_OTP_MARKER = 'supabase_auth_otp'

/** WhatsApp OTP is intentionally disabled until the provider campaign is ready. */
export type CheckoutOtpChannel = 'email'

type VerificationRow = {
  id: string
  email: string
  phone_e164: string
  email_code_hash: string | null
  phone_code_hash: string | null
  email_verified_at: string | null
  phone_verified_at: string | null
  email_send_count: number
  phone_send_count: number
  email_attempt_count: number
  phone_attempt_count: number
  last_email_sent_at: string | null
  last_phone_sent_at: string | null
  expires_at: string
}

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function generateOtp(): string {
  return String(randomInt(100000, 999999))
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const salt = process.env.POLICY_ACK_IP_SALT?.trim() || 'checkout-otp'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

function createEphemeralAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function normalizeCheckoutEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeCheckoutPhone(phone: string): string | null {
  return normalizePhoneForWhatsApp(phone)
}

async function getVerification(id: string): Promise<VerificationRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('checkout_contact_verifications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as VerificationRow | null) ?? null
}

function isExpired(row: VerificationRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now()
}

export async function assertCheckoutContactsVerified(input: {
  verificationId: string | undefined
  email: string
  phone: string
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (shouldBypassPayment()) {
    return { ok: true }
  }

  const verificationId = input.verificationId?.trim()
  if (!verificationId) {
    return { ok: false, error: 'Verify your email before paying', status: 400 }
  }

  const email = normalizeCheckoutEmail(input.email)
  const phone = normalizeCheckoutPhone(input.phone)
  if (!email || !phone) {
    return { ok: false, error: 'Valid email and WhatsApp number are required', status: 400 }
  }

  const row = await getVerification(verificationId)
  if (!row || isExpired(row)) {
    return { ok: false, error: 'Verification expired. Request a new email code.', status: 400 }
  }

  if (row.email !== email || row.phone_e164 !== phone) {
    return { ok: false, error: 'Contact details do not match verified session', status: 400 }
  }

  if (!row.email_verified_at) {
    return {
      ok: false,
      error: 'Verify your email before payment',
      status: 400,
    }
  }

  return { ok: true }
}

async function sendViaSupabaseAuthOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const auth = createEphemeralAuthClient()
  if (!auth) {
    return { ok: false, error: 'Auth email client is not configured' }
  }

  const { error } = await auth.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

async function verifyViaSupabaseAuthOtp(
  email: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = createEphemeralAuthClient()
  if (!auth) {
    return { ok: false, error: 'Auth email client is not configured' }
  }

  const { error } = await auth.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  })

  // Drop any session created by verify — checkout is still pre-account.
  await auth.auth.signOut().catch(() => undefined)

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function sendCheckoutOtp(input: {
  channel: CheckoutOtpChannel
  email: string
  phone: string
  name?: string
  verificationId?: string
  ip?: string | null
}): Promise<
  | {
      ok: true
      verificationId: string
      channel: CheckoutOtpChannel
      bypassCode?: string
      emailVerified: boolean
      phoneVerified: boolean
    }
  | { ok: false; error: string; status: number }
> {
  const email = normalizeCheckoutEmail(input.email)
  const phone = normalizeCheckoutPhone(input.phone)
  if (!email) {
    return { ok: false, error: 'Valid email is required', status: 400 }
  }
  if (!phone) {
    return { ok: false, error: 'Valid WhatsApp number is required', status: 400 }
  }

  if (input.channel !== 'email') {
    return {
      ok: false,
      error: 'WhatsApp verification is temporarily unavailable. Use email verification.',
      status: 400,
    }
  }

  const admin = createAdminClient()
  const now = Date.now()
  const expiresAt = new Date(now + OTP_TTL_MS).toISOString()
  const code = generateOtp()
  const codeHash = hashOtp(code)

  let row: VerificationRow | null = null
  if (input.verificationId?.trim()) {
    row = await getVerification(input.verificationId.trim())
    if (row && (row.email !== email || row.phone_e164 !== phone)) {
      row = null
    }
  }

  if (!row || isExpired(row)) {
    const { data, error } = await admin
      .from('checkout_contact_verifications')
      .insert({
        email,
        phone_e164: phone,
        expires_at: expiresAt,
        created_ip_hash: hashIp(input.ip ?? null),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error || !data) {
      return { ok: false, error: 'Could not start verification', status: 500 }
    }
    row = data as VerificationRow
  }

  if (row.email_send_count >= MAX_SENDS_PER_CHANNEL) {
    return {
      ok: false,
      error: 'Too many code requests. Try again later or refresh checkout.',
      status: 429,
    }
  }

  if (row.last_email_sent_at) {
    const elapsed = now - new Date(row.last_email_sent_at).getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        error: `Wait ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)}s before resending`,
        status: 429,
      }
    }
  }

  const bypass = shouldBypassPayment()
  let emailCodeHash = codeHash
  let bypassCode: string | undefined = bypass ? code : undefined

  if (isEmailConfigured()) {
    const result = await sendDirectEmail({
      to: email,
      subject: 'Your LURVOX checkout verification code',
      text: `Your LURVOX verification code is ${code}. It expires in 15 minutes.`,
      html: `<p>Your LURVOX verification code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`,
    })
    if (!result.ok || result.skipped) {
      if (!bypass) {
        return {
          ok: false,
          error: result.error ?? 'Failed to send email code',
          status: 502,
        }
      }
    }
  } else {
    const supabaseSend = await sendViaSupabaseAuthOtp(email)
    if (!supabaseSend.ok) {
      if (!bypass) {
        return {
          ok: false,
          error:
            supabaseSend.error ??
            'Could not send verification email. Please try again in a minute.',
          status: 502,
        }
      }
    }
    emailCodeHash = SUPABASE_AUTH_OTP_MARKER
    bypassCode = undefined
  }

  const { data: updated, error: updateError } = await admin
    .from('checkout_contact_verifications')
    .update({
      email_code_hash: emailCodeHash,
      email_verified_at: null,
      email_send_count: row.email_send_count + 1,
      email_attempt_count: 0,
      last_email_sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    return { ok: false, error: 'Could not save verification code', status: 500 }
  }

  const next = updated as VerificationRow
  return {
    ok: true,
    verificationId: next.id,
    channel: 'email',
    bypassCode,
    emailVerified: Boolean(next.email_verified_at),
    phoneVerified: Boolean(next.phone_verified_at),
  }
}

export async function verifyCheckoutOtp(input: {
  channel: CheckoutOtpChannel
  code: string
  verificationId: string
}): Promise<
  | {
      ok: true
      verificationId: string
      emailVerified: boolean
      phoneVerified: boolean
      bothVerified: boolean
    }
  | { ok: false; error: string; status: number }
> {
  if (input.channel !== 'email') {
    return {
      ok: false,
      error: 'WhatsApp verification is temporarily unavailable. Use email verification.',
      status: 400,
    }
  }

  const code = input.code.trim()
  if (!/^\d{6,8}$/.test(code)) {
    return { ok: false, error: 'Enter the code from your email', status: 400 }
  }

  const row = await getVerification(input.verificationId.trim())
  if (!row || isExpired(row)) {
    return { ok: false, error: 'Verification expired. Request a new email code.', status: 400 }
  }

  const attemptCount = row.email_attempt_count
  if (attemptCount >= MAX_VERIFY_ATTEMPTS) {
    return {
      ok: false,
      error: 'Too many incorrect attempts. Request a new code.',
      status: 429,
    }
  }

  const expectedHash = row.email_code_hash
  if (!expectedHash) {
    return { ok: false, error: 'Request a code first', status: 400 }
  }

  const admin = createAdminClient()
  let matches = false

  if (expectedHash === SUPABASE_AUTH_OTP_MARKER) {
    const verified = await verifyViaSupabaseAuthOtp(row.email, code)
    matches = verified.ok
    if (!matches) {
      await admin
        .from('checkout_contact_verifications')
        .update({
          email_attempt_count: attemptCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      return {
        ok: false,
        error: verified.error?.includes('expired')
          ? 'Code expired. Request a new one.'
          : 'Incorrect code',
        status: 400,
      }
    }
  } else {
    matches = safeEqualHex(hashOtp(code), expectedHash)
    if (!matches) {
      await admin
        .from('checkout_contact_verifications')
        .update({
          email_attempt_count: attemptCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      return { ok: false, error: 'Incorrect code', status: 400 }
    }
  }

  const verifiedAt = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('checkout_contact_verifications')
    .update({
      email_verified_at: verifiedAt,
      email_code_hash: null,
      updated_at: verifiedAt,
    })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error || !updated) {
    return { ok: false, error: 'Could not verify code', status: 500 }
  }

  const next = updated as VerificationRow
  const emailVerified = Boolean(next.email_verified_at)
  return {
    ok: true,
    verificationId: next.id,
    emailVerified,
    phoneVerified: Boolean(next.phone_verified_at),
    bothVerified: emailVerified,
  }
}
