import 'server-only'
import { getAffiliateCode } from '@/lib/payments/affiliate-codes'
import { formatInrFromPaise } from '@/lib/payments/checkout-discounts'
import { getPurchasablePlan } from '@/lib/payments/plans'
import { sendDirectEmail } from '@/lib/notifications/email-provider'

export function getAffiliateNotifyEmail(): string {
  return (
    process.env.AFFILIATE_NOTIFY_EMAIL?.trim() ||
    process.env.TALK_TO_COACH_NOTIFY_EMAIL?.trim() ||
    'piyushfitness44@gmail.com'
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Email the team when an affiliate / referral code converts. */
export async function notifyAffiliateCodeUsage(input: {
  code: string
  referrerLabel?: string | null
  customerEmail: string
  planSlug: string
  discountPaise: number
  amountPaise?: number | null
  purchaseId?: string | null
}): Promise<void> {
  const affiliate = getAffiliateCode(input.code)
  const code = (input.code ?? '').trim().toUpperCase()
  if (!code) return

  // Only notify for known affiliate codes (e.g. LUKE), not every promo.
  if (!affiliate) return

  const plan = getPurchasablePlan(input.planSlug)
  const planName = plan?.name ?? input.planSlug
  const referrer = input.referrerLabel?.trim() || affiliate.referrerLabel || code
  const amountPaise =
    input.amountPaise ??
    (plan ? plan.amountPaise - Math.max(0, input.discountPaise) : null)
  const amountLabel =
    amountPaise != null && amountPaise > 0 ? formatInrFromPaise(amountPaise) : '—'
  const discountLabel = formatInrFromPaise(Math.max(0, input.discountPaise))

  const subject = `Affiliate code used — ${code} (${referrer})`
  const text = [
    'An affiliate / referral discount code was used at checkout.',
    '',
    `Code: ${code}`,
    `Referrer: ${referrer}`,
    `Customer email: ${input.customerEmail}`,
    `Plan: ${planName} (${input.planSlug})`,
    `Discount: ${discountLabel}`,
    `Amount paid: ${amountLabel}`,
    input.purchaseId ? `Purchase ID: ${input.purchaseId}` : null,
    '',
    'This is an automated affiliate conversion notice from LURVOX checkout.',
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px;font-size:18px">Affiliate code used</h2>
      <p style="margin:0 0 16px;color:#555">Someone completed checkout with a partner referral code.</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:8px 0;font-weight:600;width:140px">Code</td><td style="padding:8px 0">${escapeHtml(code)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Referrer</td><td style="padding:8px 0">${escapeHtml(referrer)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Customer</td><td style="padding:8px 0"><a href="mailto:${escapeHtml(input.customerEmail)}">${escapeHtml(input.customerEmail)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Plan</td><td style="padding:8px 0">${escapeHtml(planName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Discount</td><td style="padding:8px 0">${escapeHtml(discountLabel)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600">Amount paid</td><td style="padding:8px 0">${escapeHtml(amountLabel)}</td></tr>
        ${
          input.purchaseId
            ? `<tr><td style="padding:8px 0;font-weight:600">Purchase ID</td><td style="padding:8px 0">${escapeHtml(input.purchaseId)}</td></tr>`
            : ''
        }
      </table>
    </div>
  `

  const emailed = await sendDirectEmail({
    to: getAffiliateNotifyEmail(),
    subject,
    text,
    html,
    replyTo: input.customerEmail,
  })
  if (!emailed.ok) {
    console.error('[affiliate] notify email failed:', emailed.error)
  } else if (emailed.skipped) {
    console.warn('[affiliate] notify email skipped: email provider not configured')
  }
}
