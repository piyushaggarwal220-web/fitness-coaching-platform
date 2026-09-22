/**
 * Background niche intelligence — bounded, uses existing cycle.
 */

import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { listWatchlists } from '@/lib/jarvis/instagram/niche/store'
import { researchNicheTrends, findViralReels } from '@/lib/jarvis/instagram/niche/discovery'
import { analyzeCreator } from '@/lib/jarvis/instagram/niche/creators'
import { createAdminClient } from '@/lib/supabase/admin'

export async function runNicheIntelligenceMaintenance(opts?: {
  maxSpendUsd?: number
}): Promise<{
  actions: string[]
  spent_usd: number
  alert: string | null
}> {
  const actions: string[] = []
  let spent = 0
  const maxSpend = opts?.maxSpendUsd ?? 0.25

  const gate = await assertAiBudgetAvailable(0.08)
  if (!gate.ok) {
    return { actions: ['niche:PAUSED_BUDGET'], spent_usd: 0, alert: null }
  }

  const watchlists = await listWatchlists().catch(() => [])
  const active = watchlists.filter((w) => w.active).slice(0, 1)

  if (active.length) {
    const w = active[0]
    const geo = (w.geographies?.[0] as 'INDIA' | 'GLOBAL') || 'INDIA'
    const niche = w.niches?.[0] || w.topics?.[0] || 'FAT_LOSS'
    if (spent < maxSpend) {
      const trends = await researchNicheTrends({
        niche,
        geography: geo,
        window: '7 days',
        forceRefresh: false,
        includeOpportunities: true,
      })
      spent += trends.spent_usd
      actions.push(`niche:trends:${trends.status}`)
      if (trends.report?.content_gaps?.length) {
        actions.push(`niche:gaps=${trends.report.content_gaps.length}`)
      }
    }
    for (const creator of (w.creators || []).slice(0, 1)) {
      if (spent >= maxSpend) break
      const a = await analyzeCreator({ handle: creator })
      spent += a.spent_usd
      actions.push(`niche:creator:${a.status}`)
    }
  } else {
    // Light default India fat-loss refresh if none
    const viral = await findViralReels({
      niche: 'FAT_LOSS',
      geography: 'INDIA',
      window: '7 days',
      limit: 8,
    })
    spent += viral.spent_usd
    actions.push(`niche:viral:${viral.status}`)
  }

  let alert: string | null = null
  try {
    const admin = createAdminClient()
    const { data: gaps } = await admin
      .from('jarvis_instagram_trend_reports')
      .select('content_gaps, geography, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const gapList = (gaps?.content_gaps as { topic?: string }[]) || []
    if (gapList.length >= 1) {
      alert = `Content gap signal: "${gapList[0].topic}" appears in tracked niche sample but may be missing on your account. Not a performance guarantee.`
      try {
        await admin.from('jarvis_notifications').insert({
          kind: 'niche_content_gap',
          title: 'Niche content gap',
          body: alert.slice(0, 500),
          severity: 'info',
          metadata: { geography: gaps?.geography },
        })
      } catch {
        /* optional */
      }
    }
  } catch {
    /* ignore */
  }

  return { actions, spent_usd: spent, alert }
}
