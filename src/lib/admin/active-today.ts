import { COACHING_TIME_ZONE, getCoachingDayBoundsUtc } from '@/lib/checkin-schedule'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActiveTodayBreakdown = {
  tracker: number
  checkin: number
  chat: number
}

export type ActiveTodayMetrics = {
  timezone: string
  date: string
  count: number
  breakdown: ActiveTodayBreakdown
}

function addIds(target: Set<string>, rows: Array<{ id?: string | null } | null> | null | undefined) {
  for (const row of rows ?? []) {
    const id = row?.id
    if (id) target.add(id)
  }
}

export async function getActiveTodayMetrics(): Promise<ActiveTodayMetrics> {
  const admin = createAdminClient()
  const { dateKey, startIso, endIso } = getCoachingDayBoundsUtc()

  const [trackerByDate, trackerUpdated, checkins, chats, seen] = await Promise.all([
    admin.from('daily_tracker_days').select('client_id').eq('log_date', dateKey),
    admin
      .from('daily_tracker_days')
      .select('client_id')
      .gte('updated_at', startIso)
      .lt('updated_at', endIso),
    admin
      .from('checkins')
      .select('client_id')
      .gte('submitted_at', startIso)
      .lt('submitted_at', endIso),
    admin
      .from('conversation_messages')
      .select('sender_id')
      .eq('sender_type', 'client')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    admin
      .from('profiles')
      .select('id')
      .eq('role', 'client')
      .gte('last_seen_at', startIso)
      .lt('last_seen_at', endIso),
  ])

  const trackerIds = new Set<string>()
  addIds(
    trackerIds,
    (trackerByDate.data ?? []).map((row) => ({ id: row.client_id as string | null }))
  )
  addIds(
    trackerIds,
    (trackerUpdated.data ?? []).map((row) => ({ id: row.client_id as string | null }))
  )

  const checkinIds = new Set<string>()
  addIds(
    checkinIds,
    (checkins.data ?? []).map((row) => ({ id: row.client_id as string | null }))
  )

  const chatIds = new Set<string>()
  addIds(
    chatIds,
    (chats.data ?? []).map((row) => ({ id: row.sender_id as string | null }))
  )
  addIds(chatIds, seen.data ?? [])

  const all = new Set<string>([...trackerIds, ...checkinIds, ...chatIds])

  return {
    timezone: COACHING_TIME_ZONE,
    date: dateKey,
    count: all.size,
    breakdown: {
      tracker: trackerIds.size,
      checkin: checkinIds.size,
      chat: chatIds.size,
    },
  }
}
