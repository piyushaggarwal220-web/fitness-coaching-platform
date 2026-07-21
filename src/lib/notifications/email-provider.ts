import 'server-only'
import { Resend } from 'resend'

export type DirectEmail = {
  to: string
  subject: string
  text: string
  html?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.NOTIFICATION_FROM_EMAIL?.trim())
}

/** Server-only email delivery. Missing configuration is a safe, observable skip. */
export async function sendDirectEmail(
  message: DirectEmail
): Promise<{ ok: boolean; skipped?: boolean; error?: string; providerMessageId?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.NOTIFICATION_FROM_EMAIL?.trim()
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
    return error
      ? { ok: false, error: error.message }
      : { ok: true, providerMessageId: data?.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Email send failed' }
  }
}
