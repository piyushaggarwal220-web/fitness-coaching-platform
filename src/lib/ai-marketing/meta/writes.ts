import { createAdminClient } from '@/lib/supabase/admin'
import {
  createMetaGraphClient,
  getMetaCredentials,
} from '@/lib/ai-marketing/meta/client'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { getFunnelById } from '@/lib/ai-marketing/funnels'
import { getAutonomyLevel, getGuardrails } from '@/lib/ai-marketing/settings'
import { runGuardrails } from '@/lib/ai-marketing/guardrails'
import { createHash } from 'crypto'

/**
 * Explicit human-approved Meta writes (PAUSED objects) may call the API when
 * credentials exist — even if LIVE_META_EXECUTION_ENABLED=false.
 * Going ACTIVE / auto budget changes still require LIVE_META_EXECUTION_ENABLED.
 */
export function canPushPausedMetaObjects(): boolean {
  return getMetaCredentials().ok
}

export async function executeMetaWrite(params: {
  action:
    | 'PAUSE_AD'
    | 'RESUME_AD'
    | 'INCREASE_BUDGET'
    | 'DECREASE_BUDGET'
    | 'UPDATE_AD'
    | 'UPDATE_ADSET'
    | 'UPDATE_CAMPAIGN'
  targetMetaId: string
  parameters?: Record<string, unknown>
  idempotencyKey: string
}): Promise<{ executed: boolean; result: Record<string, unknown>; error?: string }> {
  // RESUME / budget changes require full live flag
  const needsLiveFlag =
    params.action === 'RESUME_AD' ||
    params.action === 'INCREASE_BUDGET' ||
    params.action === 'DECREASE_BUDGET'

  if (needsLiveFlag && !liveMetaExecutionEnabled()) {
    return {
      executed: false,
      result: {
        status: 'recorded_not_executed',
        reason:
          'LIVE_META_EXECUTION_ENABLED is not true. Approval stored; spend/activation not called.',
        action: params.action,
        targetMetaId: params.targetMetaId,
        idempotencyKey: params.idempotencyKey,
      },
    }
  }

  if (!liveMetaExecutionEnabled() && params.action !== 'PAUSE_AD' && needsLiveFlag) {
    return {
      executed: false,
      result: { status: 'recorded_not_executed', idempotencyKey: params.idempotencyKey },
    }
  }

  if (!liveMetaExecutionEnabled() && params.action === 'PAUSE_AD') {
    // Allow pause when credentials exist as explicit approved safety action
    if (!canPushPausedMetaObjects()) {
      return {
        executed: false,
        result: {},
        error: 'Meta Ads credentials missing',
      }
    }
  } else if (!liveMetaExecutionEnabled() && params.action !== 'PAUSE_AD') {
    return {
      executed: false,
      result: {
        status: 'recorded_not_executed',
        reason: 'LIVE_META_EXECUTION_ENABLED is not true',
        idempotencyKey: params.idempotencyKey,
      },
    }
  }

  const creds = getMetaCredentials()
  if (!creds.ok) {
    return {
      executed: false,
      result: {},
      error: `Missing credentials: ${creds.missing.join(', ')}`,
    }
  }

  const client = createMetaGraphClient(creds.credentials)
  try {
    let result: Record<string, unknown> = {}
    if (params.action === 'PAUSE_AD' || params.action === 'RESUME_AD') {
      result = (await client.post(`/${params.targetMetaId}`, {
        status: params.action === 'PAUSE_AD' ? 'PAUSED' : 'ACTIVE',
      })) as Record<string, unknown>
    } else if (
      params.action === 'INCREASE_BUDGET' ||
      params.action === 'DECREASE_BUDGET'
    ) {
      const dailyBudget = params.parameters?.proposed_budget
      if (typeof dailyBudget !== 'number') {
        return { executed: false, result: {}, error: 'proposed_budget required' }
      }
      result = (await client.post(`/${params.targetMetaId}`, {
        daily_budget: Math.round(dailyBudget),
      })) as Record<string, unknown>
    } else {
      result = (await client.post(`/${params.targetMetaId}`, {
        ...(params.parameters ?? {}),
      })) as Record<string, unknown>
    }
    return { executed: true, result }
  } catch (err) {
    return {
      executed: false,
      result: {},
      error: err instanceof Error ? err.message : 'Meta write failed',
    }
  }
}

async function downloadImageAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download creative image (${res.status})`)
  const contentType = res.headers.get('content-type') || 'image/png'
  const arrayBuf = await res.arrayBuffer()
  return { buffer: Buffer.from(arrayBuf), contentType }
}

/**
 * Push an approved local creative to Meta as an Ad Creative (PAUSED usage).
 * Idempotent via meta_push_idempotency_key / existing meta_creative_id.
 */
export async function pushCreativeToMeta(params: {
  creativeId: string
  actorId: string
  pageId?: string
  linkUrl?: string
}): Promise<{
  ok: boolean
  meta_creative_id?: string
  executed: boolean
  error?: string
  result?: Record<string, unknown>
}> {
  const admin = createAdminClient()
  const { data: creative, error } = await admin
    .from('marketing_creatives')
    .select('*')
    .eq('id', params.creativeId)
    .maybeSingle()

  if (error || !creative) {
    return { ok: false, executed: false, error: 'Creative not found' }
  }

  if (!['approved', 'ready_for_meta'].includes(String(creative.status))) {
    return {
      ok: false,
      executed: false,
      error: 'Creative must be approved or ready_for_meta before Meta push',
    }
  }

  if (!creative.funnel_id) {
    return {
      ok: false,
      executed: false,
      error: 'Creative must be assigned to a funnel before Meta push',
    }
  }

  if (creative.meta_creative_id) {
    return {
      ok: true,
      executed: false,
      meta_creative_id: creative.meta_creative_id,
      result: { status: 'already_exists', meta_creative_id: creative.meta_creative_id },
    }
  }

  const idempotencyKey =
    creative.meta_push_idempotency_key ||
    createHash('sha256')
      .update(`creative:${creative.id}:${creative.image_url || ''}:${creative.headline || ''}`)
      .digest('hex')
      .slice(0, 32)

  await admin
    .from('marketing_creatives')
    .update({ meta_push_idempotency_key: idempotencyKey })
    .eq('id', creative.id)

  const creds = getMetaCredentials()
  if (!creds.ok) {
    await writeMarketingAudit({
      agent: 'meta_writes',
      decision: 'push_creative_blocked',
      error: `Missing: ${creds.missing.join(', ')}`,
      actor_id: params.actorId,
      execution_result: { creative_id: creative.id, idempotencyKey },
    })
    return {
      ok: false,
      executed: false,
      error: `Meta Ads not configured: ${creds.missing.join(', ')}`,
    }
  }

  const pageId =
    params.pageId ||
    process.env.META_ADS_PAGE_ID?.trim() ||
    ''
  const linkUrl =
    params.linkUrl ||
    process.env.META_ADS_DEFAULT_LINK_URL?.trim() ||
    (await getFunnelById(creative.funnel_id))?.landing_page ||
    'https://www.lurvox.in'

  if (!pageId) {
    return {
      ok: false,
      executed: false,
      error: 'META_ADS_PAGE_ID is required to create Meta ad creatives (Facebook Page ID)',
    }
  }

  if (!creative.image_url) {
    return { ok: false, executed: false, error: 'Creative has no image_url to upload' }
  }

  const client = createMetaGraphClient(creds.credentials)
  const accountId = creds.credentials.adAccountId

  try {
    const { buffer } = await downloadImageAsBuffer(String(creative.image_url))
    const bytes = new Uint8Array(buffer)
    // Meta adimages accepts bytes as multipart; Graph form with bytes is awkward —
    // use URL upload when image is publicly reachable, else base64.
    let imageHash: string | undefined

    if (String(creative.image_url).startsWith('http')) {
      const imgRes = (await client.post(`/${accountId}/adimages`, {
        url: String(creative.image_url),
      })) as { images?: Record<string, { hash?: string }> }
      const first = imgRes.images ? Object.values(imgRes.images)[0] : null
      imageHash = first?.hash
    }

    if (!imageHash) {
      const b64 = Buffer.from(bytes).toString('base64')
      const imgRes = (await client.post(`/${accountId}/adimages`, {
        bytes: b64,
      })) as { images?: Record<string, { hash?: string }> }
      const first = imgRes.images ? Object.values(imgRes.images)[0] : null
      imageHash = first?.hash
    }

    if (!imageHash) {
      throw new Error('Meta adimages upload did not return a hash')
    }

    const objectStorySpec = {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        link: linkUrl,
        message: creative.primary_text || creative.hook || '',
        name: creative.headline || creative.name,
        description: creative.description || '',
        call_to_action: {
          type: (creative.cta || 'LEARN_MORE').toUpperCase().replace(/\s+/g, '_'),
          value: { link: linkUrl },
        },
      },
    }

    const creativeRes = (await client.post(`/${accountId}/adcreatives`, {
      name: `[LURVOX] ${creative.name}`.slice(0, 100),
      object_story_spec: objectStorySpec,
    })) as { id?: string }

    if (!creativeRes.id) throw new Error('Meta adcreative create returned no id')

    await admin
      .from('marketing_creatives')
      .update({
        meta_creative_id: creativeRes.id,
        status: 'ready_for_meta',
        metadata: {
          ...(typeof creative.metadata === 'object' && creative.metadata
            ? (creative.metadata as object)
            : {}),
          meta_push: {
            image_hash: imageHash,
            pushed_at: new Date().toISOString(),
            page_id: pageId,
            link_url: linkUrl,
            idempotency_key: idempotencyKey,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', creative.id)

    await writeMarketingAudit({
      agent: 'meta_writes',
      decision: 'push_creative_success',
      action: 'CREATE_CREATIVE',
      approval: 'approved',
      actor_id: params.actorId,
      execution_result: {
        local_creative_id: creative.id,
        meta_creative_id: creativeRes.id,
        funnel_id: creative.funnel_id,
        idempotencyKey,
      },
    })

    return {
      ok: true,
      executed: true,
      meta_creative_id: creativeRes.id,
      result: creativeRes as Record<string, unknown>,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Meta creative push failed'
    await writeMarketingAudit({
      agent: 'meta_writes',
      decision: 'push_creative_failed',
      error: message,
      actor_id: params.actorId,
      execution_result: { creative_id: creative.id, idempotencyKey },
    })
    return { ok: false, executed: false, error: message }
  }
}

export type CreateTestInput = {
  funnelId: string
  name: string
  objective?: string
  dailyBudgetInr: number
  testDays: number
  creativeIds: string[]
  country?: string
  actorId: string
  /** When true and approved, create PAUSED Meta objects if credentials exist */
  execute?: boolean
}

/**
 * Prepare (and optionally create as PAUSED) a Meta test campaign for a funnel.
 */
export async function prepareOrCreateMetaTest(input: CreateTestInput): Promise<{
  ok: boolean
  preview: Record<string, unknown>
  executed: boolean
  launchId?: string
  error?: string
  meta?: Record<string, unknown>
}> {
  const funnel = await getFunnelById(input.funnelId)
  if (!funnel) return { ok: false, preview: {}, executed: false, error: 'Funnel not found' }

  const autonomy = await getAutonomyLevel()
  const account = await getGuardrails()
  const expectedSpend = input.dailyBudgetInr * input.testDays

  const guardrail = runGuardrails({
    action: 'CREATE_NEW_TEST',
    risk: 'medium',
    settings: {
      ...account,
      MAX_SINGLE_TEST_SPEND: funnel.test_budget_inr ?? account.MAX_SINGLE_TEST_SPEND,
    },
    proposedBudget: expectedSpend,
  })

  const admin = createAdminClient()
  const { data: creatives } = await admin
    .from('marketing_creatives')
    .select('id, name, status, meta_creative_id, funnel_id, headline')
    .in('id', input.creativeIds)

  const preview = {
    funnel: {
      id: funnel.id,
      name: funnel.name,
      price_inr: funnel.price_inr,
      target_cpa: funnel.target_cpa,
      max_acceptable_cpa: funnel.max_acceptable_cpa,
      target_roas: funnel.target_roas,
      test_budget_inr: funnel.test_budget_inr,
    },
    campaign: {
      name: input.name,
      objective: input.objective || 'OUTCOME_SALES',
      status: 'PAUSED',
      daily_budget_inr: input.dailyBudgetInr,
      test_days: input.testDays,
      expected_test_spend: expectedSpend,
    },
    creatives: creatives ?? [],
    guardrails: guardrail,
    autonomy_level: autonomy,
    note:
      'Objects will be created PAUSED. ACTIVE publishing requires LIVE_META_EXECUTION_ENABLED=true.',
  }

  if (!guardrail.passed) {
    return {
      ok: false,
      preview,
      executed: false,
      error: guardrail.blockedReasons.join('; '),
    }
  }

  const idempotencyKey = createHash('sha256')
    .update(
      `test:${input.funnelId}:${input.name}:${input.dailyBudgetInr}:${input.creativeIds.sort().join(',')}`
    )
    .digest('hex')
    .slice(0, 40)

  const { data: existing } = await admin
    .from('marketing_test_launches')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing?.meta_campaign_id) {
    return {
      ok: true,
      preview,
      executed: false,
      launchId: existing.id,
      meta: {
        status: 'already_exists',
        meta_campaign_id: existing.meta_campaign_id,
      },
    }
  }

  const { data: launch, error: launchErr } = await admin
    .from('marketing_test_launches')
    .upsert(
      {
        funnel_id: input.funnelId,
        name: input.name,
        objective: input.objective || 'OUTCOME_SALES',
        daily_budget_inr: input.dailyBudgetInr,
        test_days: input.testDays,
        expected_spend_inr: expectedSpend,
        creative_ids: input.creativeIds,
        status: input.execute ? 'approved' : 'preview',
        idempotency_key: idempotencyKey,
        preview,
        created_by: input.actorId,
      },
      { onConflict: 'idempotency_key' }
    )
    .select('*')
    .maybeSingle()

  if (launchErr) {
    return { ok: false, preview, executed: false, error: launchErr.message }
  }

  if (!input.execute) {
    return { ok: true, preview, executed: false, launchId: launch?.id }
  }

  // Execute PAUSED Meta campaign creation when credentials exist
  const creds = getMetaCredentials()
  if (!creds.ok) {
    return {
      ok: false,
      preview,
      executed: false,
      launchId: launch?.id,
      error: `Cannot execute: missing ${creds.missing.join(', ')}`,
    }
  }

  const client = createMetaGraphClient(creds.credentials)
  const accountId = creds.credentials.adAccountId
  // Meta budgets are in account currency minor units (paise for INR)
  const dailyBudgetMinor = Math.round(input.dailyBudgetInr * 100)

  try {
    const campaign = (await client.post(`/${accountId}/campaigns`, {
      name: input.name,
      objective: input.objective || 'OUTCOME_SALES',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    })) as { id?: string }

    if (!campaign.id) throw new Error('Campaign create returned no id')

    const adset = (await client.post(`/${accountId}/adsets`, {
      name: `${input.name} — Ad set`,
      campaign_id: campaign.id,
      daily_budget: dailyBudgetMinor,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations: { countries: [input.country || 'IN'] },
      },
      status: 'PAUSED',
    })) as { id?: string }

    if (!adset.id) throw new Error('Ad set create returned no id')

    const createdAds: string[] = []
    for (const cr of creatives ?? []) {
      let metaCreativeId = cr.meta_creative_id as string | null
      if (!metaCreativeId) {
        const push = await pushCreativeToMeta({
          creativeId: cr.id,
          actorId: input.actorId,
        })
        if (!push.ok || !push.meta_creative_id) {
          throw new Error(push.error || `Failed to push creative ${cr.id}`)
        }
        metaCreativeId = push.meta_creative_id
      }

      const ad = (await client.post(`/${accountId}/ads`, {
        name: `${input.name} — ${cr.name}`.slice(0, 100),
        adset_id: adset.id,
        creative: { creative_id: metaCreativeId },
        status: 'PAUSED',
      })) as { id?: string }
      if (ad.id) createdAds.push(ad.id)
    }

    // Mirror locally
    const { data: localCampaign } = await admin
      .from('marketing_campaigns')
      .upsert(
        {
          meta_campaign_id: campaign.id,
          name: input.name,
          status: 'PAUSED',
          objective: input.objective || 'OUTCOME_SALES',
          ad_account_id: accountId,
          funnel_id: input.funnelId,
          daily_budget_cents: dailyBudgetMinor,
          source: 'ai',
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'meta_campaign_id' }
      )
      .select('id')
      .maybeSingle()

    await admin
      .from('marketing_test_launches')
      .update({
        status: 'created_paused',
        meta_campaign_id: campaign.id,
        meta_adset_id: adset.id,
        meta_ad_ids: createdAds,
        local_campaign_id: localCampaign?.id ?? null,
        executed_at: new Date().toISOString(),
        execution_result: { campaign, adset, ads: createdAds },
      })
      .eq('id', launch!.id)

    await writeMarketingAudit({
      agent: 'meta_writes',
      decision: 'create_test_paused',
      action: 'CREATE_NEW_TEST',
      approval: 'approved',
      actor_id: input.actorId,
      execution_result: {
        funnel_id: input.funnelId,
        meta_campaign_id: campaign.id,
        meta_adset_id: adset.id,
        ads: createdAds,
      },
    })

    return {
      ok: true,
      preview,
      executed: true,
      launchId: launch?.id,
      meta: {
        meta_campaign_id: campaign.id,
        meta_adset_id: adset.id,
        meta_ad_ids: createdAds,
        status: 'PAUSED',
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create test failed'
    await admin
      .from('marketing_test_launches')
      .update({ status: 'failed', error: message })
      .eq('id', launch!.id)
    return { ok: false, preview, executed: false, launchId: launch?.id, error: message }
  }
}
