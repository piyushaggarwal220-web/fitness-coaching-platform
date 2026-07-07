import type { StoredComplexityTier } from '@/lib/ai/complexity-score'
import { createAdminClient } from '@/lib/supabase/admin'

export type ComplexityDistribution = {
  low: { count: number; percent: number }
  medium: { count: number; percent: number }
  high: { count: number; percent: number }
  total: number
}

export type TierMovement = {
  from: StoredComplexityTier
  to: StoredComplexityTier
  count: number
}

export type ComplexityAnalyticsPeriod = '7d' | '30d' | '90d' | 'lifetime'

export type ComplexityAnalytics = {
  distribution: ComplexityDistribution
  movements: Record<ComplexityAnalyticsPeriod, TierMovement[]>
  averageScore: number | null
  averageImprovement: number | null
  averageScoreReduction: number | null
  averageScoreIncrease: number | null
  mostImprovedClient: { id: string; name: string | null; change: number } | null
  mostComplexClient: { id: string; name: string | null; score: number; tier: StoredComplexityTier } | null
  weeklyAverageTrend: { week: string; averageScore: number }[]
  distributionChart: { tier: string; count: number }[]
  movementChart: { label: string; count: number }[]
}

type HistoryRow = {
  id: string
  client_id: string
  display_score: number
  tier: StoredComplexityTier
  previous_tier: StoredComplexityTier | null
  score_change: number | null
  created_at: string
}

type ProfileRow = {
  id: string
  name: string | null
  complexity_score: number | null
  complexity_tier: StoredComplexityTier | null
  complexity_score_change: number | null
}

const PERIOD_MS: Record<Exclude<ComplexityAnalyticsPeriod, 'lifetime'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

function tierMovementLabel(from: StoredComplexityTier, to: StoredComplexityTier): string {
  const labels = { low: 'Low', medium: 'Medium', high: 'High' }
  return `${labels[from]} → ${labels[to]}`
}

function buildDistribution(profiles: ProfileRow[]): ComplexityDistribution {
  const scored = profiles.filter((p) => p.complexity_tier)
  const total = scored.length
  const low = scored.filter((p) => p.complexity_tier === 'low').length
  const medium = scored.filter((p) => p.complexity_tier === 'medium').length
  const high = scored.filter((p) => p.complexity_tier === 'high').length
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

  return {
    low: { count: low, percent: pct(low) },
    medium: { count: medium, percent: pct(medium) },
    high: { count: high, percent: pct(high) },
    total,
  }
}

function buildMovements(history: HistoryRow[], since: Date | null): TierMovement[] {
  const filtered = since
    ? history.filter((h) => new Date(h.created_at) >= since)
    : history

  const counts = new Map<string, TierMovement>()

  for (const row of filtered) {
    if (!row.previous_tier || row.previous_tier === row.tier) continue
    const key = `${row.previous_tier}->${row.tier}`
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, { from: row.previous_tier, to: row.tier, count: 1 })
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count)
}

function weekKey(iso: string): string {
  const d = new Date(iso)
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  return start.toISOString().slice(0, 10)
}

export async function getComplexityAnalytics(coachId?: string | null): Promise<ComplexityAnalytics> {
  const admin = createAdminClient()

  let profileQuery = admin
    .from('profiles')
    .select('id, name, complexity_score, complexity_tier, complexity_score_change')
    .eq('role', 'client')

  if (coachId) {
    profileQuery = profileQuery.eq('coach_id', coachId)
  }

  const { data: profilesData } = await profileQuery
  const profiles = (profilesData ?? []) as ProfileRow[]

  let historyQuery = admin
    .from('complexity_score_history')
    .select('id, client_id, display_score, tier, previous_tier, score_change, created_at')
    .order('created_at', { ascending: false })

  if (coachId) {
    const clientIds = profiles.map((p) => p.id)
    if (clientIds.length === 0) {
      historyQuery = historyQuery.in('client_id', ['00000000-0000-0000-0000-000000000000'])
    } else {
      historyQuery = historyQuery.in('client_id', clientIds)
    }
  }

  const { data: historyData } = await historyQuery
  const history = (historyData ?? []) as HistoryRow[]

  const distribution = buildDistribution(profiles)

  const now = Date.now()
  const movements: ComplexityAnalytics['movements'] = {
    '7d': buildMovements(history, new Date(now - PERIOD_MS['7d'])),
    '30d': buildMovements(history, new Date(now - PERIOD_MS['30d'])),
    '90d': buildMovements(history, new Date(now - PERIOD_MS['90d'])),
    lifetime: buildMovements(history, null),
  }

  const scores = profiles
    .map((p) => p.complexity_score)
    .filter((s): s is number => s !== null && s !== undefined)
  const averageScore =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

  const changes = history
    .map((h) => h.score_change)
    .filter((c): c is number => c !== null && c !== undefined)
  const improvements = changes.filter((c) => c < 0)
  const increases = changes.filter((c) => c > 0)

  const averageImprovement =
    improvements.length > 0
      ? Math.round((improvements.reduce((a, b) => a + b, 0) / improvements.length) * 10) / 10
      : null
  const averageScoreReduction =
    improvements.length > 0
      ? Math.round((Math.abs(improvements.reduce((a, b) => a + b, 0)) / improvements.length) * 10) / 10
      : null
  const averageScoreIncrease =
    increases.length > 0
      ? Math.round((increases.reduce((a, b) => a + b, 0) / increases.length) * 10) / 10
      : null

  const clientChanges = new Map<string, number>()
  for (const row of history) {
    if (row.score_change === null) continue
    const prev = clientChanges.get(row.client_id)
    if (prev === undefined || row.score_change < prev) {
      clientChanges.set(row.client_id, row.score_change)
    }
  }

  let mostImprovedClient: ComplexityAnalytics['mostImprovedClient'] = null
  for (const [clientId, change] of clientChanges) {
    if (change >= 0) continue
    if (!mostImprovedClient || change < mostImprovedClient.change) {
      const profile = profiles.find((p) => p.id === clientId)
      mostImprovedClient = { id: clientId, name: profile?.name ?? null, change }
    }
  }

  let mostComplexClient: ComplexityAnalytics['mostComplexClient'] = null
  for (const profile of profiles) {
    if (profile.complexity_score == null || !profile.complexity_tier) continue
    if (!mostComplexClient || profile.complexity_score > mostComplexClient.score) {
      mostComplexClient = {
        id: profile.id,
        name: profile.name,
        score: profile.complexity_score,
        tier: profile.complexity_tier,
      }
    }
  }

  const weekBuckets = new Map<string, number[]>()
  for (const row of history) {
    const key = weekKey(row.created_at)
    const bucket = weekBuckets.get(key) ?? []
    bucket.push(row.display_score)
    weekBuckets.set(key, bucket)
  }

  const weeklyAverageTrend = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, values]) => ({
      week,
      averageScore: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    }))

  const distributionChart = [
    { tier: 'Low', count: distribution.low.count },
    { tier: 'Medium', count: distribution.medium.count },
    { tier: 'High', count: distribution.high.count },
  ]

  const movementChart = movements['30d'].map((m) => ({
    label: tierMovementLabel(m.from, m.to),
    count: m.count,
  }))

  return {
    distribution,
    movements,
    averageScore,
    averageImprovement,
    averageScoreReduction,
    averageScoreIncrease,
    mostImprovedClient,
    mostComplexClient,
    weeklyAverageTrend,
    distributionChart,
    movementChart,
  }
}
