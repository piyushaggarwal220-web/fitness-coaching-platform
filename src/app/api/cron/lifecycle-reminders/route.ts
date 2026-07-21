import { after, NextResponse } from 'next/server'
import { issuePurchaseClaimToken } from '@/lib/payments/fulfillment'
import {
  canRetryInitialGeneration,
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  type InitialPlanGenerationJob,
} from '@/lib/initial-plan-generation'
import {
  sendAccountSetupRecovery,
  sendOnboardingReminder,
} from '@/lib/notifications/lifecycle'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

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

async function scheduleInitialPlanRecovery(admin: SupabaseClient): Promise<void> {
  const { data, error } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .in('status', ['queued', 'generating'])
    .order('queued_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[cron/lifecycle-reminders] generation recovery query failed:', error.message)
    return
  }

  let recoverable: InitialPlanGenerationJob | null = null
  for (const row of (data ?? []) as InitialPlanGenerationJob[]) {
    if (row.status === 'queued') {
      recoverable = row
      break
    }
    if (canRetryInitialGeneration(row.status, row.started_at)) {
      recoverable = await retryInitialPlanGeneration(admin, row)
      if (recoverable) break
    }
  }

  if (recoverable) {
    const jobId = recoverable.id
    after(() => processInitialPlanGeneration(jobId))
  }
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  await scheduleInitialPlanRecovery(admin)
  const now = Date.now()
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

  let sent = 0
  let failed = 0
  let skipped = 0
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

  const summary = { checked: purchases?.length ?? 0, sent, failed, skipped }
  console.info('[cron/lifecycle-reminders]', summary)
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  return GET(request)
}
