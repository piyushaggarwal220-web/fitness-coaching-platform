import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAppBaseUrl } from '@/lib/admin/portal-urls'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import { NotificationTemplates, sendNotification } from '@/lib/notifications/dispatcher'
import { digitalProductDisplayName } from '@/lib/payments/digital-purchase'
import { activatePlan } from '@/lib/plans'

/** Auto-publish a digital customised plan and notify the buyer by email + in-app. */
export async function autoDeliverDigitalPlan(
  admin: SupabaseClient,
  input: {
    clientId: string
    coachId: string
    planId: string
    planSlug: string | null
  }
): Promise<{ error: string | null }> {
  const activated = await activatePlan(
    admin,
    { id: input.planId, client_id: input.clientId, coach_id: input.coachId },
    { digitalAutoPublish: true, skipReplyWait: true }
  )
  if (activated.error) return activated

  const productName = digitalProductDisplayName(input.planSlug)
  const delivered = NotificationTemplates.planDelivered(productName)
  await sendNotification({
    userId: input.clientId,
    ...delivered,
    body: `Your ${productName} is ready. Open it in the app — AI-built, not live coaching.`,
    metadata: {
      ...delivered.metadata,
      planId: input.planId,
      digital: true,
      messageSnippet: `Your ${productName} is ready in the Lurvox app.`,
    },
    idempotencyKey: `digital-plan-delivered:${input.planId}`,
  })

  const { data: profile } = await admin
    .from('profiles')
    .select('email, name')
    .eq('id', input.clientId)
    .maybeSingle()

  const email = profile?.email?.trim()
  if (email) {
    const appBase = resolveAppBaseUrl().replace(/\/$/, '')
    const planUrl = `${appBase}/plan`
    const firstName = (profile?.name || '').trim().split(/\s+/)[0] || 'there'
    await sendDirectEmail({
      to: email,
      subject: `Your ${productName} is ready`,
      text: [
        `Hi ${firstName},`,
        '',
        `Your customised Lurvox plan (${productName}) is ready.`,
        'This is an AI-built personalized plan — not live human coaching.',
        '',
        `Open your plan: ${planUrl}`,
        '',
        'You can also find it anytime in the Lurvox app under My Plan.',
        '',
        '— Lurvox',
      ].join('\n'),
      html: `
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Your customised Lurvox plan (<strong>${escapeHtml(productName)}</strong>) is ready.</p>
        <p>This is an <strong>AI-built</strong> personalized plan — not live human coaching.</p>
        <p><a href="${planUrl}">Open your plan</a></p>
        <p>You can also find it anytime in the Lurvox app under My Plan.</p>
        <p>— Lurvox</p>
      `,
    })
  }

  return { error: null }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
