import 'server-only'
import { Resend } from 'resend'

export type DirectEmail = {
  to: string
  subject: string
  text: string
  html?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && resolveFromAddress())
}

function resolveFromAddress(): string | null {
  const from =
    process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    ''
  return from || null
}

/** Server-only email delivery. Missing configuration is a safe, observable skip. */
export async function sendDirectEmail(
  message: DirectEmail
): Promise<{ ok: boolean; skipped?: boolean; error?: string; providerMessageId?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = resolveFromAddress()
  if (!apiKey || !from) {
    console.info('[email] Skipped: RESEND_API_KEY or NOTIFICATION_FROM_EMAIL is unset')
    return { ok: true, skipped: true }
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
    if (error) {
      return { ok: false, error: humanizeResendError(error.message, from) }
    }
    return { ok: true, providerMessageId: data?.id }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Email send failed'
    return { ok: false, error: humanizeResendError(raw, from) }
  }
}

function humanizeResendError(message: string, from: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('only send testing emails') ||
    lower.includes('only send emails to your own') ||
    lower.includes('verify a domain')
  ) {
    return (
      'Email is still in Resend test mode. Set NOTIFICATION_FROM_EMAIL to an address on your verified domain ' +
      `(e.g. LURVOX <onboarding@lurvox.in>), not ${from.includes('resend.dev') ? '@resend.dev' : 'a test sender'}, then redeploy.`
    )
  }
  return message
}
