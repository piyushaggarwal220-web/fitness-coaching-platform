import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertTrialClient } from '@/lib/admin/trial-client-guard'

export type ResetTrialClientResult = {
  clientId: string
  email: string | null
  message: string
  deleted: {
    plans: number
    checkins: number
    workouts: number
    supportRequests: number
    aiLogs: number
  }
}

async function deleteClientStorageFolder(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const bucket = admin.storage.from('onboarding-photos')

  const { data: files, error } = await bucket.list(clientId, { limit: 100 })
  if (error || !files?.length) return

  const paths = files.map((file) => `${clientId}/${file.name}`)
  await bucket.remove(paths)
}

/**
 * Reset a trial client to a fresh state while preserving auth, profile, and entitlement.
 * Deletes coaching data only — never the auth user or trial access flags.
 */
export async function resetTrialClient(clientId: string): Promise<ResetTrialClientResult> {
  const profile = await assertTrialClient(clientId)
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()

  const { data: supportRequests } = await admin
    .from('support_requests')
    .select('id')
    .eq('client_id', clientId)

  const supportIds = (supportRequests ?? []).map((row) => row.id)
  if (supportIds.length > 0) {
    const { error: messagesError } = await admin
      .from('support_messages')
      .delete()
      .in('request_id', supportIds)
    if (messagesError) throw new Error(messagesError.message)
  }

  const [
    { count: supportCount, error: supportError },
    { count: checkinCount, error: checkinError },
    { count: planCount, error: planError },
    { count: workoutCount, error: workoutError },
    { count: aiLogCount, error: aiLogError },
  ] = await Promise.all([
    admin.from('support_requests').delete({ count: 'exact' }).eq('client_id', clientId),
    admin.from('checkins').delete({ count: 'exact' }).eq('client_id', clientId),
    admin.from('plans').delete({ count: 'exact' }).eq('client_id', clientId),
    admin.from('workouts').delete({ count: 'exact' }).eq('user_id', clientId),
    admin.from('ai_generation_logs').delete({ count: 'exact' }).eq('client_id', clientId),
  ])

  for (const err of [supportError, checkinError, planError, workoutError, aiLogError]) {
    if (err) throw new Error(err.message)
  }

  await deleteClientStorageFolder(clientId)

  const now = new Date().toISOString()
  const resetPayload: Record<string, unknown> = {
    onboarding_complete: false,
    onboarding_completed_at: null,
    onboarding_data: null,
    plan_delivered: false,
    checkin_schedule_started_at: null,
    checkin_awaiting: false,
    checkin_overdue: false,
    age: null,
    gender: null,
    height: null,
    weight: null,
    fitness_goal: null,
    training_experience: null,
    activity_level: null,
    diet_preference: null,
    injuries: null,
    medical_notes: null,
    sleep_duration: null,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    terms_accepted_at: null,
    payment_confirmed: true,
    updated_at: now,
  }

  if (includeAccessSource) {
    resetPayload.access_source = 'admin_trial'
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update(resetPayload)
    .eq('id', clientId)

  if (profileError) throw new Error(profileError.message)

  return {
    clientId,
    email: profile.email ?? null,
    message: 'Trial client reset to fresh state. Login credentials unchanged.',
    deleted: {
      plans: planCount ?? 0,
      checkins: checkinCount ?? 0,
      workouts: workoutCount ?? 0,
      supportRequests: supportCount ?? 0,
      aiLogs: aiLogCount ?? 0,
    },
  }
}
