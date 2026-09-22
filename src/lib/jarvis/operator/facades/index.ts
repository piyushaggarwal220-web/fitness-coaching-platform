/**
 * Thin Phase 2 operator facades — wrap existing tools/services.
 * No duplicate Meta/IG/Shopify/revenue math.
 */

import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { listFunnels, getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import {
  isInstagramConfigured,
  instagramStatus,
  liveInstagramPublishingEnabled,
} from '@/lib/jarvis/instagram'
import {
  isShopifyConfigured,
  shopifyOrderStats,
  shopifyTestConnection,
} from '@/lib/jarvis/shopify/client'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import {
  describeVideoProviderConfig,
  getVideoEditProvider,
  isVideoProviderConfigured,
} from '@/lib/jarvis/video/provider'
import { isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import { runObjectiveResearch } from '@/lib/jarvis/research/research-agent'

export const lurvoxRevenueOperator = {
  async today() {
    return loadLurvoxRevenue({ preset: 'today' })
  },
  async yesterday() {
    return loadLurvoxRevenue({ preset: 'yesterday' })
  },
  async lastNDays(days: number) {
    return loadLurvoxRevenue({ preset: 'last_n_days', days })
  },
  async compareTodayVsYesterday() {
    const [today, yesterday] = await Promise.all([
      loadLurvoxRevenue({ preset: 'today' }),
      loadLurvoxRevenue({ preset: 'yesterday' }),
    ])
    return {
      today,
      yesterday,
      note: 'Compare only when both data_status are verified. Failure ≠ 0.',
      separations: 'LURVOX cash only — not Meta, not Shopify.',
    }
  },
}

export const funnelOperator = {
  async list() {
    return listFunnels()
  },
  async performance(days = 7) {
    return getPerformanceByFunnel({ days })
  },
  async focus(funnelHint: '99' | '1699' | string) {
    const funnels = await listFunnels()
    const perf = await getPerformanceByFunnel({ days: 7 })
    const needle = String(funnelHint).replace(/[^\d]/g, '')
    const matched = funnels.filter((f) => {
      const price = String(f.price_inr ?? '')
      const name = `${f.name} ${f.slug}`.toLowerCase()
      if (needle === '99') return price.includes('99') && !price.includes('1699')
      if (needle === '1699') return price.includes('1699') || name.includes('1699')
      return name.includes(String(funnelHint).toLowerCase()) || price.includes(needle)
    })
    const ids = new Set(matched.map((f) => f.id))
    return {
      funnels: matched,
      performance: (perf.byFunnel || []).filter(
        (row) => row.funnel_id != null && ids.has(row.funnel_id)
      ),
      note: 'Funnel economics are independent — do not blend with other funnels.',
    }
  },
}

export const metaAdsOperator = {
  async status() {
    const meta = await loadMetaIntegrationStatus()
    return {
      ...meta,
      live_execution_enabled: liveMetaExecutionEnabled(),
      note: 'Meta attributed purchases ≠ LURVOX cash revenue.',
    }
  },
  async performance(days = 7) {
    return getPerformanceByFunnel({ days })
  },
}

export const instagramOperator = {
  async status() {
    if (!isInstagramConfigured()) {
      return {
        configured: false,
        live_publishing_enabled: false,
        data_status: 'unavailable' as const,
      }
    }
    const status = await instagramStatus()
    return {
      configured: true,
      live_publishing_enabled: liveInstagramPublishingEnabled(),
      status,
    }
  },
}

export const shopifyOperator = {
  async status() {
    if (!isShopifyConfigured()) {
      return { configured: false, data_status: 'unavailable' as const }
    }
    const test = await shopifyTestConnection().catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : 'test failed',
    }))
    return {
      configured: true,
      test,
      note: 'Shopify commerce ≠ LURVOX coaching revenue.',
    }
  },
  async orderStats(days = 7) {
    if (!isShopifyConfigured()) {
      return { configured: false, data_status: 'unavailable' as const }
    }
    return shopifyOrderStats(days)
  },
}

export const creativeOperator = {
  async performance(days = 14) {
    const rows = await listCreativePerformance({ days })
    return {
      days,
      count: rows.length,
      fatigued: rows.filter((c) => c.classification === 'FATIGUED' || c.classification === 'DECLINING'),
      losers: rows.filter((c) => c.classification === 'LOSER'),
      note: 'Generation does not spend ad budget. Preserve funnel_id — never guess.',
    }
  },
}

export const videoOperator = {
  status() {
    const provider = getVideoEditProvider()
    return {
      configured: isVideoProviderConfigured(),
      provider: provider.name,
      detail: describeVideoProviderConfig(),
      note: 'Do not claim AI scene understanding unless the provider supports it.',
    }
  },
}

export const researchOperator = {
  configured() {
    return isBraveSearchConfigured()
  },
  async research(input: {
    question: string
    objective?: string
    actorId?: string | null
  }) {
    if (!isBraveSearchConfigured()) {
      return {
        status: 'unavailable' as const,
        error: 'RESEARCH_UNAVAILABLE',
        note: 'Brave Search not configured — do not invent sources.',
      }
    }
    return runObjectiveResearch({
      question: input.question,
      objective: input.objective || input.question,
      decisionContext: 'Jarvis Phase 2 business operator research request',
      actorId: input.actorId,
    })
  },
}
