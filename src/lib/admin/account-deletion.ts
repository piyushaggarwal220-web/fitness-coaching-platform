import { createAdminClient } from '@/lib/supabase/admin'

export type DeleteAccountResult = {
  ok: true
  deleted: Record<string, number>
} | {
  ok: false
  error: string
  blocked?: { assignedClients: number }
}

async function deleteStorageFolder(bucketName: string, prefix: string): Promise<number> {
  const admin = createAdminClient()
  const bucket = admin.storage.from(bucketName)

  let removed = 0
  // Storage list is paginated but doesn't always support a cursor; loop a few times until empty.
  for (let i = 0; i < 20; i++) {
    const { data: files, error } = await bucket.list(prefix, { limit: 100 })
    if (error || !files?.length) break

    const paths = files.map((f) => `${prefix}/${f.name}`)
    const { error: removeError } = await bucket.remove(paths)
    if (removeError) break
    removed += paths.length

    if (files.length < 100) break
  }

  return removed
}

export async function deleteClientAccount(input: {
  clientId: string
  deletedBy: string
  reason?: string | null
}): Promise<DeleteAccountResult> {
  const admin = createAdminClient()
  const clientId = input.clientId.trim()
  if (!clientId) return { ok: false, error: 'clientId is required' }

  const deleted: Record<string, number> = {}

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', clientId)
    .maybeSingle()
  if (profileError) return { ok: false, error: profileError.message }
  if (!profile) return { ok: false, error: 'Client not found' }

  // Delete rows that otherwise become SET NULL.
  const [
    purchasesRes,
    notificationsRes,
    aiLogsRes,
  ] = await Promise.all([
    admin.from('purchases').delete({ count: 'exact' }).eq('user_id', clientId),
    admin.from('platform_notifications').delete({ count: 'exact' }).eq('recipient_id', clientId),
    admin.from('ai_generation_logs').delete({ count: 'exact' }).eq('client_id', clientId),
  ])
  for (const err of [purchasesRes.error, notificationsRes.error, aiLogsRes.error]) {
    if (err) return { ok: false, error: err.message }
  }
  deleted.purchases = purchasesRes.count ?? 0
  deleted.platform_notifications = notificationsRes.count ?? 0
  deleted.ai_generation_logs = aiLogsRes.count ?? 0

  // Delete storage objects (best-effort; do before deleting profile fields).
  deleted.onboarding_photos = await deleteStorageFolder('onboarding-photos', clientId)
  deleted.checkin_photos = await deleteStorageFolder('checkin-photos', clientId)

  // Delete profile last so FK cascades cleanly remove client-owned tables.
  const { count: profileDeleted, error: deleteProfileError } = await admin
    .from('profiles')
    .delete({ count: 'exact' })
    .eq('id', clientId)
  if (deleteProfileError) return { ok: false, error: deleteProfileError.message }
  deleted.profiles = profileDeleted ?? 0

  // Remove the auth user (must be last).
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(clientId)
  if (authDeleteError) {
    return { ok: false, error: `Failed to delete auth user: ${authDeleteError.message}` }
  }

  const { error: auditError } = await admin.from('admin_audit_logs').insert({
    action: 'delete_client',
    target_user_id: clientId,
    target_role: profile.role ?? 'client',
    performed_by: input.deletedBy,
    reason: input.reason ?? null,
    metadata: { email: profile.email ?? null },
  })
  if (auditError) return { ok: false, error: `Audit log insert failed: ${auditError.message}` }

  return { ok: true, deleted }
}

export async function deleteCoachAccount(input: {
  coachId: string
  deletedBy: string
  reason?: string | null
  reassignToCoachId?: string | null
}): Promise<DeleteAccountResult> {
  const admin = createAdminClient()
  const coachId = input.coachId.trim()
  if (!coachId) return { ok: false, error: 'coachId is required' }

  const deleted: Record<string, number> = {}

  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id, user_id, name')
    .eq('id', coachId)
    .maybeSingle()
  if (coachError) return { ok: false, error: coachError.message }
  if (!coach) return { ok: false, error: 'Coach not found' }

  const { count: assignedClients, error: assignedError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'client')
    .eq('coach_id', coachId)
  if (assignedError) return { ok: false, error: assignedError.message }

  if ((assignedClients ?? 0) > 0) {
    const target = input.reassignToCoachId?.trim() || null
    if (!target) {
      return { ok: false, error: 'Coach has assigned clients', blocked: { assignedClients: assignedClients ?? 0 } }
    }
    if (target === coachId) {
      return { ok: false, error: 'Cannot reassign to the same coach' }
    }

    const { error: reassignError } = await admin
      .from('profiles')
      .update({ coach_id: target })
      .eq('role', 'client')
      .eq('coach_id', coachId)
    if (reassignError) return { ok: false, error: reassignError.message }
    deleted.reassigned_clients = assignedClients ?? 0
  }

  // Remove coach traces/content (client-owned support requests remain).
  const [
    coachLogsRes,
    coachMessagesRes,
  ] = await Promise.all([
    admin.from('ai_generation_logs').delete({ count: 'exact' }).eq('coach_id', coachId),
    admin
      .from('support_messages')
      .delete({ count: 'exact' })
      .eq('sender_type', 'coach')
      .eq('sender_id', coachId),
  ])
  for (const err of [coachLogsRes.error, coachMessagesRes.error]) {
    if (err) return { ok: false, error: err.message }
  }
  deleted.ai_generation_logs = coachLogsRes.count ?? 0
  deleted.support_messages = coachMessagesRes.count ?? 0

  const { count: coachDeleted, error: deleteCoachError } = await admin
    .from('coaches')
    .delete({ count: 'exact' })
    .eq('id', coachId)
  if (deleteCoachError) return { ok: false, error: deleteCoachError.message }
  deleted.coaches = coachDeleted ?? 0

  const { count: profileDeleted, error: deleteProfileError } = await admin
    .from('profiles')
    .delete({ count: 'exact' })
    .eq('id', coach.user_id)
  if (deleteProfileError) return { ok: false, error: deleteProfileError.message }
  deleted.profiles = profileDeleted ?? 0

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(coach.user_id)
  if (authDeleteError) {
    return { ok: false, error: `Failed to delete auth user: ${authDeleteError.message}` }
  }

  const { error: auditError } = await admin.from('admin_audit_logs').insert({
    action: 'delete_coach',
    target_user_id: coach.user_id,
    target_role: 'coach',
    performed_by: input.deletedBy,
    reason: input.reason ?? null,
    metadata: { coachId: coachId, name: coach.name ?? null },
  })
  if (auditError) return { ok: false, error: `Audit log insert failed: ${auditError.message}` }

  return { ok: true, deleted }
}

