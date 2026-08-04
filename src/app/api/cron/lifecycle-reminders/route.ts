import { after, NextResponse } from 'next/server'
import { issuePurchaseClaimToken } from '@/lib/payments/fulfillment'
import {
  backfillMissingInitialPlanJobs,
  canRetryInitialGeneration,
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  shouldStartInitialGeneration,
  type InitialPlanGenerationJob,
} from '@/lib/initial-plan-generation'
import { revokeExpiredClientSubscriptions } from '@/lib/client-entitlement-guard'
import {
  MEMBERSHIP_GRACE_DAYS,
  MEMBERSHIP_RENEWAL_WARNING_DAYS,
  membershipReminderStage,
  subscriptionDaysRemaining,
} from '@/lib/entitlements'
import {
  sendAccountSetupRecovery,
  sendMembershipRenewalReminder,
  sendOnboardingReminder,
} from '@/lib/notifications/lifecycle'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 24 * 60 * 60 * 1000

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production'
  }
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function reminderStage(createdAt: string, now: number): string | null {
  const ageHours = (now - new Date(createdAt).getTime()) / 3_600_000
  if (ageHours >= 144) return 'day_6'
  if (ageHours >= 72) return 'day_3'
  if (ageHours >= 24) return 'day_1'
  return null
}

async function scheduleInitialPlanRecovery(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .in('status', ['queued', 'generating'])
    .order('queued_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[cron/lifecycle-reminders] generation recovery query failed:', error.message)
    return 0
  }

  const toStart: string[] = []
  for (const row of (data ?? []) as InitialPlanGenerationJob[]) {
    if (toStart.length >= 5) break
    if (row.status === 'queued') {
      toStart.push(row.id)
      continue
    }
    if (canRetryInitialGeneration(row.status, row.started_at)) {
      const recoverable = await retryInitialPlanGeneration(admin, row)
      if (recoverable) toStart.push(recoverable.id)
    }
  }

  // Also create jobs for onboarded clients who never got a queue row.
  if (toStart.length < 5) {
    const backfilled = await backfillMissingInitialPlanJobs(admin, 5 - toStart.length)
    for (const job of backfilled) {
      if (shouldStartInitialGeneration(job.status)) toStart.push(job.id)
    }
  }

  for (const jobId of toStart) {
    after(() =>
      processInitialPlanGeneration(jobId).catch((err) => {
        console.error(
          '[cron/lifecycle-reminders] generation recovery failed:',
          jobId,
          err instanceof Error ? err.message : err
        )
      })
    )
  }

  return toStart.length
}

async function sendMembershipExpiryReminders(admin: SupabaseClient, now: number): Promise<{
  checked: number
  sent: number
  failed: number
  skipped: number
}> {
  const windowStart = new Date(now - MEMBERSHIP_GRACE_DAYS * DAY_MS).toISOString()
  const windowEnd = new Date(now + (MEMBERSHIP_RENEWAL_WARNING_DAYS + 1) * DAY_MS).toISOString()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, phone, name, payment_confirmed, access_source, subscription_expires_at')
    .eq('role', 'client')
    .eq('payment_confirmed', true)
    .neq('access_source', 'admin_trial')
    .not('subscription_expires_at', 'is', null)
    .gte('subscription_expires_at', windowStart)
    .lte('subscription_expires_at', windowEnd)
    .order('subscription_expires_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[cron/lifecycle-reminders] membership query failed:', error.message)
    return { checked: 0, sent: 0, failed: 0, skipped: 0 }
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const profile of profiles ?? []) {
    if (!profile.subscription_expires_at) continue
    const stage = membershipReminderStage(profile.subscription_expires_at, now)
    if (!stage) {
      skipped += 1
      continue
    }
    const daysRemaining = subscriptionDaysRemaining(
      {
        access_source: profile.access_source,
        subscription_expires_at: profile.subscription_expires_at,
      },
      now
    )
    try {
      const result = await sendMembershipRenewalReminder({
        userId: profile.id,
        email: profile.email,
        phone: profile.phone,
        name: profile.name,
        stage,
        endsAt: profile.subscription_expires_at,
        daysRemaining: daysRemaining ?? 0,
      })
      sent += result.sent
      failed += result.failed
      skipped += result.skipped
    } catch (deliveryError) {
      failed += 1
      console.error(
        '[cron/lifecycle-reminders] membership reminder failed:',
        deliveryError instanceof Error ? deliveryError.message : 'unknown'
      )
    }
  }

  return { checked: profiles?.length ?? 0, sent, failed, skipped }
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const revokedSubscriptions = await revokeExpiredClientSubscriptions(50)
  const recoveredJobs = await scheduleInitialPlanRecovery(admin)
  const now = Date.now()
  const membershipReminders = await sendMembershipExpiryReminders(admin, now)
  const cutoff = new Date(now - 24 * 3_600_000).toISOString()
  const { data: purchases, error } = await admin
    .from('purchases')
    .select(
      'id, user_id, customer_email, customer_phone, customer_name, claimed_at, created_at, profiles:user_id(id, email, phone, name, gender, onboarding_complete, progress_photo_front, progress_photo_side, progress_photo_back, payment_confirmed)'
    )
    .eq('status', 'captured')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[cron/lifecycle-reminders] purchase query failed:', error.message)
    return NextResponse.json({ error: 'Lifecycle query failed' }, { status: 500 })
  }

  let sent = membershipReminders.sent
  let failed = membershipReminders.failed
  let skipped = membershipReminders.skipped
  const processedUsers = new Set<string>()

  for (const row of purchases ?? []) {
    const stage = reminderStage(row.created_at, now)
    if (!stage) continue

    if (!row.claimed_at || !row.user_id) {
      try {
        const kind = `account_setup_${stage}`
        const { count: alreadyDelivered } = await admin
          .from('lifecycle_deliveries')
          .select('id', { count: 'exact', head: true })
          .eq('purchase_id', row.id)
          .eq('kind', kind)
          .eq('status', 'sent')
        if ((alreadyDelivered ?? 0) > 0) {
          skipped += 1
          continue
        }
        const token = await issuePurchaseClaimToken(row.id)
        const result = await sendAccountSetupRecovery({
          purchaseId: row.id,
          token,
          email: row.customer_email,
          phone: row.customer_phone,
          name: row.customer_name,
          stage,
        })
        sent += result.sent
        failed += result.failed
        skipped += result.skipped
      } catch (deliveryError) {
        failed += 1
        console.error(
          '[cron/lifecycle-reminders] account setup failed:',
          deliveryError instanceof Error ? deliveryError.message : 'unknown'
        )
      }
      continue
    }

    if (processedUsers.has(row.user_id)) continue
    processedUsers.add(row.user_id)
    const profileRaw = row.profiles
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
      email?: string | null
      phone?: string | null
      name?: string | null
      gender?: string | null
      onboarding_complete?: boolean | null
      progress_photo_front?: string | null
      progress_photo_side?: string | null
      progress_photo_back?: string | null
      payment_confirmed?: boolean | null
    } | null
    if (!profile?.payment_confirmed || profile.onboarding_complete) continue

    const photosMissing =
      stage !== 'day_1' &&
      profile.gender !== 'female' &&
      (!profile.progress_photo_front || !profile.progress_photo_side || !profile.progress_photo_back)
    try {
      const result = await sendOnboardingReminder({
        userId: row.user_id,
        email: profile.email || row.customer_email,
        phone: profile.phone || row.customer_phone,
        name: profile.name || row.customer_name,
        stage,
        photosMissing,
      })
      sent += result.sent
      failed += result.failed
      skipped += result.skipped
    } catch (deliveryError) {
      failed += 1
      console.error(
        '[cron/lifecycle-reminders] onboarding reminder failed:',
        deliveryError instanceof Error ? deliveryError.message : 'unknown'
      )
    }
  }

  const summary = {
    checked: purchases?.length ?? 0,
    sent,
    failed,
    skipped,
    recoveredJobs,
    revokedSubscriptions,
    membershipReminders,
  }
  console.info('[cron/lifecycle-reminders]', summary)
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  return GET(request)
}
