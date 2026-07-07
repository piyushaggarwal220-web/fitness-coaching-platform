import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SupportMessage,
  SupportRequest,
  SupportRequestCategory,
  SupportRequestFormData,
  SupportRequestPriority,
  SupportRequestStatus,
} from '@/types/database'
import { formatFitnessGoal } from '@/lib/coach-utils'
import { getOnboardingLabel } from '@/lib/onboarding'

export const SUPPORT_CATEGORIES: { value: SupportRequestCategory; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'diet_update', label: 'Diet Update' },
  { value: 'workout_update', label: 'Workout Update' },
  { value: 'pain_injury', label: 'Pain / Injury' },
  { value: 'general', label: 'General' },
]

export const SUPPORT_PRIORITIES: { value: SupportRequestPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const INITIAL_SUPPORT_FORM: SupportRequestFormData = {
  category: 'question',
  title: '',
  message: '',
  priority: 'normal',
}

export function formatSupportCategory(category: SupportRequestCategory): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function formatSupportStatus(status: SupportRequestStatus): string {
  if (status === 'open') return 'Open'
  if (status === 'claimed') return 'Claimed'
  return 'Closed'
}

export function formatSupportPriority(priority: SupportRequestPriority): string {
  return SUPPORT_PRIORITIES.find((p) => p.value === priority)?.label ?? priority
}

/** Anonymous client label for unclaimed queue — e.g. Client #a3f2 */
export function formatClientRef(clientId: string): string {
  const compact = clientId.replace(/-/g, '')
  return `Client #${compact.slice(-4)}`
}

export function anonymizedClientSummary(
  profile: {
    age?: string | number | null
    gender?: string | null
    fitness_goal?: string | null
  } | null | undefined,
  clientId: string,
  snapshot?: { client_age?: string | null; client_gender?: string | null; client_goal?: string | null }
) {
  const age = snapshot?.client_age ?? (profile?.age != null ? String(profile.age) : '—')
  const gender = snapshot?.client_gender
    ? getOnboardingLabel('gender', snapshot.client_gender)
    : profile?.gender
      ? getOnboardingLabel('gender', profile.gender)
      : '—'
  const goal = snapshot?.client_goal
    ? formatFitnessGoal(snapshot.client_goal)
    : formatFitnessGoal(profile?.fitness_goal)

  return {
    label: formatClientRef(clientId),
    age,
    gender,
    goal,
  }
}

export function validateSupportForm(data: SupportRequestFormData): string | null {
  if (!data.title.trim()) return 'Title is required.'
  if (!data.message.trim()) return 'Message is required.'
  if (data.message.trim().length < 10) return 'Please provide more detail (at least 10 characters).'
  return null
}

export async function createSupportRequest(
  supabase: SupabaseClient,
  clientId: string,
  form: SupportRequestFormData
): Promise<{ data: SupportRequest | null; error: string | null }> {
  const now = new Date().toISOString()

  const { data: profile } = await supabase
    .from('profiles')
    .select('age, gender, fitness_goal')
    .eq('id', clientId)
    .maybeSingle()

  const { data: request, error } = await supabase
    .from('support_requests')
    .insert({
      client_id: clientId,
      category: form.category,
      title: form.title.trim(),
      message: form.message.trim(),
      priority: form.priority,
      status: 'open',
      client_age: profile?.age != null ? String(profile.age) : null,
      client_gender: profile?.gender ?? null,
      client_goal: profile?.fitness_goal ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !request) return { data: null, error: error?.message ?? 'Failed to create request.' }

  const { error: msgError } = await supabase.from('support_messages').insert({
    request_id: request.id,
    sender_type: 'client',
    sender_id: clientId,
    message: form.message.trim(),
    created_at: now,
  })

  if (msgError) return { data: null, error: msgError.message }

  return { data: request as SupportRequest, error: null }
}

export async function claimSupportRequest(
  supabase: SupabaseClient,
  requestId: string,
  coachId: string
): Promise<{ data: SupportRequest | null; error: string | null }> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('support_requests')
    .update({
      status: 'claimed',
      claimed_by: coachId,
      claimed_at: now,
      updated_at: now,
    })
    .eq('id', requestId)
    .eq('status', 'open')
    .select()
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Request is no longer available to claim.' }

  return { data: data as SupportRequest, error: null }
}

export async function closeSupportRequest(
  supabase: SupabaseClient,
  requestId: string,
  coachId: string
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('support_requests')
    .update({
      status: 'closed',
      closed_at: now,
      updated_at: now,
    })
    .eq('id', requestId)
    .eq('claimed_by', coachId)
    .eq('status', 'claimed')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Only the assigned coach can close this request.' }
  return { error: null }
}

export async function addSupportReply(
  supabase: SupabaseClient,
  input: {
    requestId: string
    senderType: 'client' | 'coach'
    senderId: string
    message: string
  }
): Promise<{ data: SupportMessage | null; error: string | null }> {
  const body = input.message.trim()
  if (!body) return { data: null, error: 'Message cannot be empty.' }

  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      request_id: input.requestId,
      sender_type: input.senderType,
      sender_id: input.senderId,
      message: body,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to send reply.' }

  await supabase
    .from('support_requests')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.requestId)

  return { data: data as SupportMessage, error: null }
}

export function canClientReply(
  request: Pick<SupportRequest, 'status'>,
  messages: Pick<SupportMessage, 'sender_type'>[]
): boolean {
  if (request.status === 'closed') return false
  return messages.some((m) => m.sender_type === 'coach')
}

export function formatSupportDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
