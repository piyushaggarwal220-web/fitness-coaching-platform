import 'server-only'
import { recalculateClientComplexityAdmin } from '@/lib/complexity/recalculate'
import { createAdminClient } from '@/lib/supabase/admin'
import { ONBOARDING_PHOTO_BUCKET } from '@/lib/onboarding'
import {
  describeProfileChange,
  profileChangeHasWork,
  type PhotoSlot,
  type ProfileChangeProposal,
} from '@/lib/ai/ai-coach-profile-change-pure'

export type { ProfileChangeProposal }
export {
  describeProfileChange,
  extractProfileChangeFromText,
  profileChangeChatInstruction,
  profileChangeHasWork,
  stripProfileChangeTrailer,
  withProfileConfirmCue,
} from '@/lib/ai/ai-coach-profile-change-pure'

const METRIC_COLUMNS = new Set([
  'age',
  'height',
  'weight',
  'gender',
  'fitness_goal',
  'diet_preference',
  'activity_level',
  'training_experience',
  'sleep_duration',
  'injuries',
  'medical_notes',
])

function parsePending(raw: unknown): ProfileChangeProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as ProfileChangeProposal
  if (!profileChangeHasWork(row)) return null
  return {
    summary: typeof row.summary === 'string' ? row.summary.slice(0, 240) : 'Update your profile',
    columns: row.columns && typeof row.columns === 'object' ? row.columns : {},
    onboarding: row.onboarding && typeof row.onboarding === 'object' ? row.onboarding : {},
    photoSlot: row.photoSlot ?? null,
    photoPath: typeof row.photoPath === 'string' ? row.photoPath : null,
    calorieTarget: typeof row.calorieTarget === 'number' ? row.calorieTarget : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
  }
}

export async function loadPendingProfileChange(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<ProfileChangeProposal | null> {
  const { data } = await admin
    .from('ai_coach_memory')
    .select('pending_profile_change')
    .eq('client_id', clientId)
    .maybeSingle()
  return parsePending(data?.pending_profile_change)
}

export async function savePendingProfileChange(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  pending: ProfileChangeProposal | null
): Promise<void> {
  const { data } = await admin
    .from('ai_coach_memory')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (data) {
    await admin
      .from('ai_coach_memory')
      .update({
        pending_profile_change: pending,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
    return
  }
  await admin.from('ai_coach_memory').insert({
    client_id: clientId,
    summary: '',
    mood: 'plain',
    pending_profile_change: pending,
  })
}

function mergeOnboarding(
  current: unknown,
  proposal: ProfileChangeProposal
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  for (const [group, fields] of Object.entries(proposal.onboarding)) {
    const existing =
      base[group] && typeof base[group] === 'object' && !Array.isArray(base[group])
        ? { ...(base[group] as Record<string, unknown>) }
        : {}
    base[group] = { ...existing, ...fields }
  }
  if (proposal.calorieTarget != null) {
    const diet =
      base.diet && typeof base.diet === 'object' && !Array.isArray(base.diet)
        ? { ...(base.diet as Record<string, unknown>) }
        : {}
    diet.requestedCalories = proposal.calorieTarget
    base.diet = diet
  }
  return base
}

async function copyChatPhoto(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  sourcePath: string,
  slot: PhotoSlot
): Promise<string> {
  if (!sourcePath.startsWith(`${clientId}/`) || sourcePath.includes('..')) {
    throw new Error('That photo is not on your account.')
  }
  const { data, error } = await admin.storage.from('chat-images').download(sourcePath)
  if (error || !data) throw new Error('I could not read that photo. Send it again.')
  const bytes = Buffer.from(await data.arrayBuffer())
  if (!bytes.length || bytes.length > 8_000_000) throw new Error('That photo is too large.')
  const ext = (sourcePath.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const bucket = slot === 'avatar' || slot === 'gallery' ? 'avatars' : ONBOARDING_PHOTO_BUCKET
  const dest = `${clientId}/chat-${slot}-${Date.now()}.${ext}`
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  const { error: uploadError } = await admin.storage.from(bucket).upload(dest, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadError) throw new Error('I could not save that photo. Send it again.')
  return dest
}

export async function applyProfileChangeFromChat(input: {
  clientId: string
  pending: ProfileChangeProposal
}): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, onboarding_data, profile_gallery_paths')
    .eq('id', input.clientId)
    .maybeSingle()
  if (error || !profile) {
    return { ok: false, message: 'I could not open your profile. Try again in a moment.' }
  }

  const patch: Record<string, unknown> = {
    ...input.pending.columns,
    updated_at: new Date().toISOString(),
  }

  const touchesOnboarding =
    Object.keys(input.pending.onboarding).length > 0 || input.pending.calorieTarget != null
  if (touchesOnboarding) {
    patch.onboarding_data = mergeOnboarding(profile.onboarding_data, input.pending)
  }

  if (input.pending.photoSlot && input.pending.photoPath) {
    try {
      const dest = await copyChatPhoto(
        admin,
        input.clientId,
        input.pending.photoPath,
        input.pending.photoSlot
      )
      if (input.pending.photoSlot === 'avatar') patch.avatar_path = dest
      if (input.pending.photoSlot === 'front') patch.progress_photo_front = dest
      if (input.pending.photoSlot === 'side') patch.progress_photo_side = dest
      if (input.pending.photoSlot === 'back') patch.progress_photo_back = dest
      if (input.pending.photoSlot === 'gallery') {
        const current = Array.isArray(profile.profile_gallery_paths)
          ? profile.profile_gallery_paths.filter((item): item is string => typeof item === 'string')
          : []
        patch.profile_gallery_paths = [...current, dest].slice(-12)
      }
    } catch (photoError) {
      const reason = photoError instanceof Error ? photoError.message : 'I could not save that photo.'
      return { ok: false, message: reason }
    }
  } else if (input.pending.photoSlot && !input.pending.photoPath) {
    return {
      ok: false,
      message: 'Send the photo in this chat, tell me if it is front, side, back, or your profile photo, then reply YES.',
    }
  }

  const { error: updateError } = await admin.from('profiles').update(patch).eq('id', input.clientId)
  if (updateError) {
    return { ok: false, message: 'I could not save that on your profile. Try again in a moment.' }
  }

  const metricTouched = Object.keys(input.pending.columns).some((key) => METRIC_COLUMNS.has(key))
  if (metricTouched || touchesOnboarding) {
    try {
      await recalculateClientComplexityAdmin(input.clientId, { trigger: 'profile_edit_client' })
    } catch {
      // The profile row is already saved.
    }
  }

  const saved = describeProfileChange(input.pending)
  const calorieNote =
    input.pending.calorieTarget != null
      ? ' Your next plan edit and the next check-in update will use this calorie target. The plan already in My Plan stays until then.'
      : ' The plan already in My Plan stays until a plan edit or your next check-in update.'
  return {
    ok: true,
    message: `Saved on your profile: ${saved}.${calorieNote}`,
  }
}
