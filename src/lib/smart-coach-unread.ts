import type { SupabaseClient } from '@supabase/supabase-js'

const READ_KEY = 'lurvox-smart-coach-read-at'
export const SMART_COACH_READ_EVENT = 'lurvox-smart-coach-read'

export function markSmartCoachRead(at?: string, options?: { notify?: boolean }) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READ_KEY, at ?? new Date().toISOString())
  if (options?.notify !== false) {
    window.dispatchEvent(new Event(SMART_COACH_READ_EVENT))
  }
}

function storedReadAt(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(READ_KEY)
}

/**
 * Assistant replies newer than the last time this browser opened Smart Coach.
 * The first visit baselines to the latest message so old history is not a badge.
 */
export async function countSmartCoachUnread(
  supabase: SupabaseClient,
  clientId: string
): Promise<number> {
  const since = storedReadAt()
  if (!since) {
    const { data } = await supabase
      .from('ai_coach_messages')
      .select('created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    markSmartCoachRead(
      (data?.created_at as string | undefined) ?? new Date().toISOString(),
      { notify: false }
    )
    return 0
  }

  const { count } = await supabase
    .from('ai_coach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('role', 'assistant')
    .gt('created_at', since)

  return count ?? 0
}
