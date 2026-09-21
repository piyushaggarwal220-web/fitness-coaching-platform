import { createAdminClient } from '@/lib/supabase/admin'
import {
  createMetaGraphClient,
  extractPurchasesAndRevenue,
  getMetaCredentials,
  getMetaIntegrationStatus,
  META_INSIGHT_FIELDS,
  type MetaInsightRow,
  type MetaGraphClient,
} from '@/lib/ai-marketing/meta/client'
import { calcCpa, calcRoas } from '@/lib/ai-marketing/metrics'
import { getSetting, setSetting } from '@/lib/ai-marketing/settings'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { refreshCreativePerformanceForFunnel } from '@/lib/ai-marketing/creative-performance'
import {
  DIAGNOSTIC_META_SYNC_BOUNDS,
  FULL_META_SYNC_BOUNDS,
  MetaSyncStageTracker,
  safeMetaSyncMessage,
  withBoundedRetry,
  type MetaSyncBounds,
  type MetaSyncTrace,
} from '@/lib/ai-marketing/meta/sync-stages'

export type MetaSyncResult = {
  ok: boolean
  mode: 'live' | 'unconfigured' | 'diagnostic'
  missing?: string[]
  campaignsUpserted: number
  adsetsUpserted: number
  adsUpserted: number
  creativesUpserted: number
  performanceRows: number
  unclassifiedCampaigns: number
  error?: string
  failed_stage?: string | null
  trace?: MetaSyncTrace
  /** True when Meta Graph reads succeeded (API probe path). Does not imply persistence. */
  api_ok?: boolean
  /** True when marketing_performance rows were written. */
  persistence_ok?: boolean
  last_sync_at_updated?: boolean
  audit_written?: boolean
}

type ListResponse<T> = { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }

export type FetchPagesResult<T> = {
  items: T[]
  page_count: number
}

/**
 * Bounded pagination — never unbounded historical pulls.
 * Stops at maxPages even if Meta offers more cursors.
 */
export async function fetchPagesBounded<T>(
  client: MetaGraphClient,
  path: string,
  query: Record<string, string>,
  maxPages: number
): Promise<FetchPagesResult<T>> {
  const out: T[] = []
  let after: string | undefined
  let page_count = 0
  const limit = Math.max(1, maxPages)
  for (let page = 0; page < limit; page++) {
    const q = { ...query }
    if (after) q.after = after
    const res = await client.get<ListResponse<T>>(path, q)
    page_count += 1
    out.push(...(res.data ?? []))
    after = res.paging?.cursors?.after
    if (!after || !(res.data?.length)) break
  }
  return { items: out, page_count }
}

/** Preserve existing funnel_id — never overwrite with null / never guess. */
async function upsertCampaign(row: {
  meta_campaign_id: string
  name: string
  status?: string
  objective?: string | null
  ad_account_id: string
}): Promise<{ id: string; funnel_id: string | null }> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketing_campaigns')
    .select('id, funnel_id')
    .eq('meta_campaign_id', row.meta_campaign_id)
    .maybeSingle()

  const { data, error } = await admin
    .from('marketing_campaigns')
    .upsert(
      {
        meta_campaign_id: row.meta_campaign_id,
        name: row.name,
        status: row.status ?? 'UNKNOWN',
        objective: row.objective ?? null,
        ad_account_id: row.ad_account_id,
        source: 'meta_sync',
        funnel_id: existing?.funnel_id ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'meta_campaign_id' }
    )
    .select('id, funnel_id')
    .maybeSingle()
  if (error) throw new Error(`persistence: campaign upsert failed: ${error.message}`)
  return { id: data!.id as string, funnel_id: (data?.funnel_id as string | null) ?? null }
}

async function upsertAdset(row: {
  meta_adset_id: string
  campaign_id: string
  funnel_id: string | null
  name: string
  status?: string
  daily_budget_cents?: number | null
}): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketing_adsets')
    .select('id, funnel_id')
    .eq('meta_adset_id', row.meta_adset_id)
    .maybeSingle()

  const funnelId = existing?.funnel_id ?? row.funnel_id
  const { data, error } = await admin
    .from('marketing_adsets')
    .upsert(
      {
        meta_adset_id: row.meta_adset_id,
        campaign_id: row.campaign_id,
        funnel_id: funnelId,
        name: row.name,
        status: row.status ?? 'UNKNOWN',
        daily_budget_cents: row.daily_budget_cents ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'meta_adset_id' }
    )
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`persistence: adset upsert failed: ${error.message}`)
  return data!.id as string
}

async function upsertAd(row: {
  meta_ad_id: string
  adset_id: string
  campaign_id: string
  funnel_id: string | null
  name: string
  status?: string
  creative_id?: string | null
}): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketing_ads')
    .select('id, funnel_id, creative_id')
    .eq('meta_ad_id', row.meta_ad_id)
    .maybeSingle()

  const { data, error } = await admin
    .from('marketing_ads')
    .upsert(
      {
        meta_ad_id: row.meta_ad_id,
        adset_id: row.adset_id,
        campaign_id: row.campaign_id,
        funnel_id: existing?.funnel_id ?? row.funnel_id,
        creative_id: row.creative_id ?? existing?.creative_id ?? null,
        name: row.name,
        status: row.status ?? 'UNKNOWN',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'meta_ad_id' }
    )
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`persistence: ad upsert failed: ${error.message}`)
  return data!.id as string
}

async function upsertImportedCreative(row: {
  meta_creative_id: string
  name: string
  funnel_id: string | null
  image_url?: string | null
  primary_text?: string | null
  headline?: string | null
  description?: string | null
  cta?: string | null
}): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketing_creatives')
    .select('id, funnel_id')
    .eq('meta_creative_id', row.meta_creative_id)
    .maybeSingle()

  if (existing?.id) {
    await admin
      .from('marketing_creatives')
      .update({
        name: row.name,
        funnel_id: existing.funnel_id ?? row.funnel_id,
        image_url: row.image_url ?? undefined,
        primary_text: row.primary_text ?? undefined,
        headline: row.headline ?? undefined,
        description: row.description ?? undefined,
        cta: row.cta ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await admin
    .from('marketing_creatives')
    .insert({
      name: row.name,
      type: 'static',
      meta_creative_id: row.meta_creative_id,
      funnel_id: row.funnel_id,
      image_url: row.image_url ?? null,
      primary_text: row.primary_text ?? null,
      headline: row.headline ?? null,
      description: row.description ?? null,
      cta: row.cta ?? null,
      status: 'draft',
      source: 'imported',
      metadata: { imported_from: 'meta_sync' },
    })
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`persistence: creative insert failed: ${error.message}`)
  return data!.id as string
}

export type MetaSyncDeps = {
  persistPerformanceRow: (payload: Record<string, unknown>) => Promise<void>
  writeAudit: typeof writeMarketingAudit
  updateMetaIntegrationSetting: (value: {
    configured: boolean
    last_sync_at?: string | null
    last_sync_error?: string | null
  }) => Promise<void>
  getMetaIntegrationSetting: () => Promise<{
    last_sync_at?: string | null
    last_sync_error?: string | null
  }>
  parseInsightRow?: (row: MetaInsightRow) => { purchases: number; revenue: number }
  upsertCampaign?: typeof upsertCampaign
  upsertAdset?: typeof upsertAdset
  upsertAd?: typeof upsertAd
  lookupAdCreativeId?: (adUuid: string) => Promise<string | null>
}

function defaultDeps(): MetaSyncDeps {
  return {
    persistPerformanceRow: async (payload) => {
      const admin = createAdminClient()
      const { error } = await admin.from('marketing_performance').upsert(payload, {
        onConflict: 'date,meta_campaign_id,meta_adset_id,meta_ad_id',
      })
      if (error) throw new Error(`persistence: marketing_performance upsert failed: ${error.message}`)
    },
    writeAudit: writeMarketingAudit,
    updateMetaIntegrationSetting: async (value) => {
      await setSetting('meta_integration', value)
    },
    getMetaIntegrationSetting: async () =>
      getSetting<{ last_sync_at?: string | null; last_sync_error?: string | null }>(
        'meta_integration',
        {}
      ),
    parseInsightRow: extractPurchasesAndRevenue,
  }
}

export type SyncMetaOptions = {
  datePreset?: string
  actorId?: string | null
  /** full = production sync; diagnostic = smallest useful E2E read-only dataset */
  mode?: 'full' | 'diagnostic'
  bounds?: Partial<MetaSyncBounds>
  client?: MetaGraphClient
  deps?: Partial<MetaSyncDeps>
}

function resolveBounds(opts?: SyncMetaOptions): MetaSyncBounds {
  const base = opts?.mode === 'diagnostic' ? DIAGNOSTIC_META_SYNC_BOUNDS : FULL_META_SYNC_BOUNDS
  return {
    ...base,
    ...opts?.bounds,
    datePreset: opts?.datePreset ?? opts?.bounds?.datePreset ?? base.datePreset,
  }
}

/**
 * Real Meta Marketing API sync with stage-level tracing and bounded I/O.
 * Preserves funnel_id. Never auto-classifies.
 * lastSyncAt updates ONLY after successful persistence + audit path.
 * API probe success alone does not update lastSyncAt.
 */
export async function syncMetaMarketingData(opts?: SyncMetaOptions): Promise<MetaSyncResult> {
  const mode = opts?.mode ?? 'full'
  const bounds = resolveBounds(opts)
  const tracker = new MetaSyncStageTracker(mode)
  const deps: MetaSyncDeps = { ...defaultDeps(), ...opts?.deps }

  tracker.begin('START', `${mode} sync`)
  tracker.end('START', 'ok')

  let campaignsUpserted = 0
  let adsetsUpserted = 0
  let adsUpserted = 0
  let creativesUpserted = 0
  let performanceRows = 0
  let unclassifiedCampaigns = 0
  let totalPages = 0

  try {
    const creds = await tracker.run('CONFIG_VALIDATION', async () => {
      const status = getMetaIntegrationStatus()
      if (!status.configured) {
        throw new Error(`Meta Ads not configured. Missing: ${status.missing.join(', ')}`)
      }
      const c = getMetaCredentials()
      if (!c.ok) throw new Error(`Missing: ${c.missing.join(', ')}`)
      return c.credentials
    })

    const client =
      opts?.client ??
      createMetaGraphClient(creds, { timeoutMs: bounds.requestTimeoutMs })
    const accountId = creds.adAccountId

    // Light account validation (does not update lastSyncAt)
    await withBoundedRetry(
      () =>
        client.get(`/${accountId}`, {
          fields: 'id,name,account_status',
        }),
      bounds.maxRetries
    )

    const campaignFetch = await tracker.run(
      'CAMPAIGN_FETCH',
      () =>
        withBoundedRetry(
          () =>
            fetchPagesBounded<{
              id: string
              name: string
              status: string
              objective?: string
            }>(
              client,
              `/${accountId}/campaigns`,
              {
                fields: 'id,name,status,objective',
                limit: String(bounds.campaignLimit),
              },
              bounds.maxPages
            ),
          bounds.maxRetries
        ),
      {
        item_count: (r) => r.items.length,
        page_count: (r) => r.page_count,
      }
    )
    totalPages += campaignFetch.page_count
    const campaigns = campaignFetch.items.slice(0, bounds.campaignLimit)

    const campaignIdMap = new Map<string, string>()
    const campaignFunnelMap = new Map<string, string | null>()

    const upsertCampaignFn = deps.upsertCampaign ?? upsertCampaign
    const upsertAdsetFn = deps.upsertAdset ?? upsertAdset
    const upsertAdFn = deps.upsertAd ?? upsertAd

    for (const c of campaigns) {
      const { id, funnel_id } = await upsertCampaignFn({
        meta_campaign_id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective ?? null,
        ad_account_id: accountId,
      })
      campaignIdMap.set(c.id, id)
      campaignFunnelMap.set(c.id, funnel_id)
      campaignsUpserted += 1
      if (!funnel_id) unclassifiedCampaigns += 1
    }

    const adsetFetch = await tracker.run(
      'ADSET_FETCH',
      () =>
        withBoundedRetry(
          () =>
            fetchPagesBounded<{
              id: string
              name: string
              status: string
              campaign_id: string
              daily_budget?: string
            }>(
              client,
              `/${accountId}/adsets`,
              {
                fields: 'id,name,status,campaign_id,daily_budget',
                limit: String(bounds.adsetLimit),
              },
              bounds.maxPages
            ),
          bounds.maxRetries
        ),
      {
        item_count: (r) => r.items.length,
        page_count: (r) => r.page_count,
      }
    )
    totalPages += adsetFetch.page_count
    const adsets = adsetFetch.items.slice(0, bounds.adsetLimit)

    const adsetIdMap = new Map<string, string>()
    const adsetFunnelMap = new Map<string, string | null>()
    for (const a of adsets) {
      const campaignUuid = campaignIdMap.get(a.campaign_id)
      if (!campaignUuid) continue
      const daily = a.daily_budget !== undefined ? Math.round(Number(a.daily_budget)) : null
      const funnelId = campaignFunnelMap.get(a.campaign_id) ?? null
      const id = await upsertAdsetFn({
        meta_adset_id: a.id,
        campaign_id: campaignUuid,
        funnel_id: funnelId,
        name: a.name,
        status: a.status,
        daily_budget_cents: Number.isFinite(daily as number) ? daily : null,
      })
      adsetIdMap.set(a.id, id)
      adsetFunnelMap.set(a.id, funnelId)
      adsetsUpserted += 1
    }

    const creativeIdMap = new Map<string, string>()
    if (bounds.includeCreatives) {
      const creativeFetch = await fetchPagesBounded<{
        id: string
        name?: string
        title?: string
        body?: string
        image_url?: string
        thumbnail_url?: string
        call_to_action_type?: string
      }>(
        client,
        `/${accountId}/adcreatives`,
        {
          fields: 'id,name,title,body,image_url,thumbnail_url,call_to_action_type',
          limit: '50',
        },
        bounds.maxPages
      )
      totalPages += creativeFetch.page_count
      for (const cr of creativeFetch.items) {
        const localId = await upsertImportedCreative({
          meta_creative_id: cr.id,
          name: cr.name || cr.title || `Meta creative ${cr.id}`,
          funnel_id: null,
          image_url: cr.image_url || cr.thumbnail_url || null,
          primary_text: cr.body ?? null,
          headline: cr.title ?? null,
          cta: cr.call_to_action_type ?? null,
        })
        creativeIdMap.set(cr.id, localId)
        creativesUpserted += 1
      }
    }

    const adFetch = await tracker.run(
      'AD_FETCH',
      () =>
        withBoundedRetry(
          () =>
            fetchPagesBounded<{
              id: string
              name: string
              status: string
              adset_id: string
              campaign_id: string
              creative?: { id?: string }
            }>(
              client,
              `/${accountId}/ads`,
              {
                fields: 'id,name,status,adset_id,campaign_id,creative{id}',
                limit: String(bounds.adLimit),
              },
              bounds.maxPages
            ),
          bounds.maxRetries
        ),
      {
        item_count: (r) => r.items.length,
        page_count: (r) => r.page_count,
      }
    )
    totalPages += adFetch.page_count
    const ads = adFetch.items.slice(0, bounds.adLimit)

    const adIdMap = new Map<string, string>()
    for (const ad of ads) {
      const adsetUuid = adsetIdMap.get(ad.adset_id)
      const campaignUuid = campaignIdMap.get(ad.campaign_id)
      if (!adsetUuid) continue
      const funnelId =
        adsetFunnelMap.get(ad.adset_id) ?? campaignFunnelMap.get(ad.campaign_id) ?? null
      const metaCreativeId = ad.creative?.id
      const localCreativeId = metaCreativeId ? creativeIdMap.get(metaCreativeId) ?? null : null

      if (localCreativeId && funnelId && !deps.upsertAd) {
        const admin = createAdminClient()
        await admin
          .from('marketing_creatives')
          .update({ funnel_id: funnelId })
          .eq('id', localCreativeId)
          .is('funnel_id', null)
      }

      const id = await upsertAdFn({
        meta_ad_id: ad.id,
        adset_id: adsetUuid,
        campaign_id: campaignUuid ?? '',
        funnel_id: funnelId,
        name: ad.name,
        status: ad.status,
        creative_id: localCreativeId,
      })
      adIdMap.set(ad.id, id)
      adsUpserted += 1
    }

    const insightFetch = await tracker.run(
      'INSIGHTS_FETCH',
      () =>
        withBoundedRetry(
          () =>
            fetchPagesBounded<MetaInsightRow>(
              client,
              `/${accountId}/insights`,
              {
                fields: META_INSIGHT_FIELDS,
                level: 'ad',
                date_preset: bounds.datePreset,
                time_increment: '1',
                limit: String(bounds.insightsLimit),
              },
              bounds.maxPages
            ),
          bounds.maxRetries
        ),
      {
        item_count: (r) => r.items.length,
        page_count: (r) => r.page_count,
      }
    )
    totalPages += insightFetch.page_count
    tracker.api_ok = true

    await tracker.run(
      'PAGINATION',
      async () => ({ totalPages, maxPages: bounds.maxPages }),
      {
        page_count: (r) => r.totalPages,
        item_count: (r) => r.maxPages,
      }
    )

    const parseFn = deps.parseInsightRow ?? extractPurchasesAndRevenue
    const parsed = await tracker.run(
      'RESPONSE_PARSING',
      async () => {
        const rows: Array<{
          row: MetaInsightRow
          purchases: number
          revenue: number
          spend: number
          date: string
        }> = []
        for (const row of insightFetch.items.slice(0, bounds.insightsLimit)) {
          try {
            const { purchases, revenue } = parseFn(row)
            const date = row.date_start
            if (!date) continue
            rows.push({
              row,
              purchases,
              revenue,
              spend: Number(row.spend) || 0,
              date,
            })
          } catch (err) {
            throw new Error(
              `parse: invalid insight row: ${err instanceof Error ? err.message : 'unknown'}`
            )
          }
        }
        return rows
      },
      { item_count: (r) => r.length }
    )

    await tracker.run(
      'FUNNEL_CLASSIFICATION',
      async () => {
        // Preserve existing funnel_id only — never invent from price/spend.
        return {
          classified: campaignsUpserted - unclassifiedCampaigns,
          unclassified: unclassifiedCampaigns,
        }
      },
      { item_count: () => unclassifiedCampaigns }
    )

    const aggregated = await tracker.run(
      'AGGREGATION',
      async () =>
        parsed.map((p) => ({
          ...p,
          cpa: calcCpa(p.spend, p.purchases),
          roas: calcRoas(p.revenue, p.spend),
          impressions: Number(p.row.impressions) || 0,
          reach: Number(p.row.reach) || 0,
          clicks: Number(p.row.clicks) || 0,
        })),
      { item_count: (r) => r.length }
    )

    await tracker.run(
      'PERFORMANCE_PERSISTENCE',
      async () => {
        for (const p of aggregated) {
          const campaignUuid = p.row.campaign_id
            ? campaignIdMap.get(p.row.campaign_id) ?? null
            : null
          const funnelId = p.row.campaign_id
            ? campaignFunnelMap.get(p.row.campaign_id) ?? null
            : null
          const adUuid = p.row.ad_id ? adIdMap.get(p.row.ad_id) ?? null : null

          let creativeId: string | null = null
          if (adUuid) {
            if (deps.lookupAdCreativeId) {
              creativeId = await deps.lookupAdCreativeId(adUuid)
            } else {
              const admin = createAdminClient()
              const { data: adRow } = await admin
                .from('marketing_ads')
                .select('creative_id')
                .eq('id', adUuid)
                .maybeSingle()
              creativeId = adRow?.creative_id ?? null
            }
          }

          await deps.persistPerformanceRow({
            date: p.date,
            ad_account_id: accountId,
            campaign_id: campaignUuid,
            adset_id: p.row.adset_id ? adsetIdMap.get(p.row.adset_id) ?? null : null,
            ad_id: adUuid,
            creative_id: creativeId,
            funnel_id: funnelId,
            meta_campaign_id: p.row.campaign_id ?? null,
            meta_adset_id: p.row.adset_id ?? null,
            meta_ad_id: p.row.ad_id ?? null,
            spend: p.spend,
            impressions: p.impressions,
            reach: p.reach,
            clicks: p.clicks,
            ctr: p.row.ctr !== undefined ? Number(p.row.ctr) : null,
            cpc: p.row.cpc !== undefined ? Number(p.row.cpc) : null,
            cpm: p.row.cpm !== undefined ? Number(p.row.cpm) : null,
            frequency: p.row.frequency !== undefined ? Number(p.row.frequency) : null,
            purchases: p.purchases,
            revenue: p.revenue,
            cpa: p.cpa,
            roas: p.roas,
            conversion_value: p.revenue,
            conversions: p.purchases,
            raw: p.row,
            is_mock: false,
          })
          performanceRows += 1
        }
        tracker.performance_rows_written = performanceRows
        tracker.persistence_ok = true
        return performanceRows
      },
      { item_count: () => performanceRows }
    )

    if (bounds.refreshCreativePerformance) {
      const admin = createAdminClient()
      const { data: funnels } = await admin
        .from('marketing_funnels')
        .select('id')
        .eq('status', 'active')
      for (const f of funnels ?? []) {
        await refreshCreativePerformanceForFunnel(f.id)
      }
    }

    await tracker.run('SYNC_AUDIT', async () => {
      await deps.writeAudit({
        agent: 'meta_sync',
        decision: mode === 'diagnostic' ? 'sync_diagnostic_completed' : 'sync_completed',
        reasoning:
          mode === 'diagnostic'
            ? 'Bounded diagnostic Meta sync completed (read-only, minimal dataset)'
            : 'Synced Meta campaigns, ad sets, ads, creatives, and insights',
        action: 'SYNC_META',
        approval: 'n/a',
        actor_id: opts?.actorId ?? null,
        execution_result: tracker.toPublicPayload(),
        input_summary: {
          mode,
          date_preset: bounds.datePreset,
          max_pages: bounds.maxPages,
          campaignsUpserted,
          performanceRows,
          unclassifiedCampaigns,
          liveExecutionFlag: liveMetaExecutionEnabled(),
        },
      })
      tracker.audit_written = true
    })

    // ONLY successful full persistence flow updates lastSyncAt
    await tracker.run('LAST_SYNC_AT_UPDATE', async () => {
      await deps.updateMetaIntegrationSetting({
        configured: true,
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      })
      tracker.last_sync_at_updated = true
    })

    tracker.begin('COMPLETE')
    tracker.end('COMPLETE', 'ok', {
      item_count: performanceRows,
      page_count: totalPages,
      message: 'Sync pipeline completed',
    })

    try {
      const { emitJarvisEvent } = await import('@/lib/jarvis/workers/events')
      await emitJarvisEvent('meta.sync_completed', {
        campaignsUpserted,
        performanceRows,
        unclassifiedCampaigns,
        mode,
      })
    } catch {
      // non-fatal
    }

    const trace = tracker.finish()
    return {
      ok: true,
      mode: mode === 'diagnostic' ? 'diagnostic' : 'live',
      campaignsUpserted,
      adsetsUpserted,
      adsUpserted,
      creativesUpserted,
      performanceRows,
      unclassifiedCampaigns,
      failed_stage: null,
      trace,
      api_ok: true,
      persistence_ok: true,
      last_sync_at_updated: true,
      audit_written: true,
    }
  } catch (err) {
    const message = safeMetaSyncMessage(err)
    // Preserve prior lastSyncAt — never clear it on failure; never set it on API-only success
    try {
      const prev = await deps.getMetaIntegrationSetting()
      await deps.updateMetaIntegrationSetting({
        configured: true,
        last_sync_at: prev.last_sync_at ?? null,
        last_sync_error: message,
      })
    } catch {
      // settings update failure is secondary
    }

    try {
      await deps.writeAudit({
        agent: 'meta_sync',
        decision: mode === 'diagnostic' ? 'sync_diagnostic_failed' : 'sync_failed',
        reasoning: message,
        action: 'SYNC_META',
        error: message,
        actor_id: opts?.actorId ?? null,
        execution_result: tracker.toPublicPayload(),
      })
      tracker.audit_written = true
    } catch {
      // audit failure secondary
    }

    if (!tracker.failed_stage) {
      tracker.end('COMPLETE', 'failed', { error: err })
    } else {
      tracker.skip('COMPLETE', `Stopped at ${tracker.failed_stage}`)
    }

    return {
      ok: false,
      mode: mode === 'diagnostic' ? 'diagnostic' : 'live',
      campaignsUpserted,
      adsetsUpserted,
      adsUpserted,
      creativesUpserted,
      performanceRows,
      unclassifiedCampaigns,
      error: message,
      failed_stage: tracker.failed_stage,
      trace: tracker.finish(),
      api_ok: tracker.api_ok,
      persistence_ok: tracker.persistence_ok,
      last_sync_at_updated: false,
      audit_written: tracker.audit_written,
    }
  }
}

/** Smallest useful read-only sync to locate hangs and prove E2E persistence. */
export async function runDiagnosticMetaSync(opts?: {
  actorId?: string | null
  client?: MetaGraphClient
  deps?: Partial<MetaSyncDeps>
}): Promise<MetaSyncResult> {
  return syncMetaMarketingData({
    mode: 'diagnostic',
    actorId: opts?.actorId,
    client: opts?.client,
    deps: opts?.deps,
  })
}

export { executeMetaWrite } from '@/lib/ai-marketing/meta/writes'
export { DIAGNOSTIC_META_SYNC_BOUNDS, FULL_META_SYNC_BOUNDS } from '@/lib/ai-marketing/meta/sync-stages'
