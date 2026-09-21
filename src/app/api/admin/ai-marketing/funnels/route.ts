import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  assignCampaignToFunnel,
  assignCreativeToFunnel,
  createFunnel,
  listFunnels,
  updateFunnel,
} from '@/lib/ai-marketing/funnels'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import type { MarketingFunnel } from '@/lib/ai-marketing/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const funnels = await listFunnels({ includeArchived: true })
    return NextResponse.json({ success: true, funnels })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json()) as Partial<MarketingFunnel> & {
    slug?: string
    name?: string
    offer?: string
    product?: string
    price_inr?: number
    target_cpa?: number
    max_acceptable_cpa?: number
    target_roas?: number
    min_roas?: number
  }

  if (
    !body.slug ||
    !body.name ||
    !body.offer ||
    !body.product ||
    body.price_inr == null ||
    body.target_cpa == null ||
    body.max_acceptable_cpa == null ||
    body.target_roas == null ||
    body.min_roas == null
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'slug, name, offer, product, price_inr, target_cpa, max_acceptable_cpa, target_roas, min_roas required',
      },
      { status: 400 }
    )
  }

  try {
    const funnel = await createFunnel({
      slug: body.slug,
      name: body.name,
      offer: body.offer,
      product: body.product,
      price_inr: body.price_inr,
      estimated_fulfillment_cost_inr: body.estimated_fulfillment_cost_inr ?? 0,
      contribution_margin_inr:
        body.contribution_margin_inr ??
        body.price_inr - (body.estimated_fulfillment_cost_inr ?? 0),
      aov_inr: body.aov_inr ?? body.price_inr,
      target_cpa: body.target_cpa,
      max_acceptable_cpa: body.max_acceptable_cpa,
      target_roas: body.target_roas,
      min_roas: body.min_roas,
      daily_budget_inr: body.daily_budget_inr ?? null,
      test_budget_inr: body.test_budget_inr ?? null,
      max_daily_budget_inr: body.max_daily_budget_inr ?? null,
      max_budget_increase_percent: body.max_budget_increase_percent ?? 20,
      max_budget_decrease_percent: body.max_budget_decrease_percent ?? 50,
      min_spend_before_pause: body.min_spend_before_pause ?? 500,
      min_purchases_for_winner: body.min_purchases_for_winner ?? 3,
      min_data_window_days: body.min_data_window_days ?? 3,
      conversion_event: body.conversion_event ?? 'purchase',
      landing_page: body.landing_page ?? null,
      checkout_url: body.checkout_url ?? null,
      target_audience: body.target_audience ?? null,
      tracks_downstream_upsell: Boolean(body.tracks_downstream_upsell),
      downstream_funnel_id: body.downstream_funnel_id ?? null,
      notes: body.notes ?? null,
      status: body.status ?? 'active',
    })

    await writeMarketingAudit({
      agent: 'funnels',
      decision: 'funnel_created',
      action: 'CREATE_NEW_TEST',
      actor_id: auth.user.id,
      execution_result: { funnel_id: funnel.id, slug: funnel.slug },
    })

    return NextResponse.json({ success: true, funnel })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json()) as { id?: string } & Partial<MarketingFunnel>
  if (!body.id) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }
  const { id, ...patch } = body
  try {
    const funnel = await updateFunnel(id, patch)
    await writeMarketingAudit({
      agent: 'funnels',
      decision: 'funnel_updated',
      actor_id: auth.user.id,
      execution_result: { funnel_id: id, keys: Object.keys(patch) },
    })
    return NextResponse.json({ success: true, funnel })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json()) as {
    action?: 'assign_campaign' | 'assign_creative'
    campaignId?: string
    creativeId?: string
    /** null or omit with unclassified=true => UNCLASSIFIED */
    funnelId?: string | null
    unclassified?: boolean
    cascade?: boolean
  }

  const funnelId = body.unclassified ? null : body.funnelId ?? null

  try {
    if (body.action === 'assign_campaign') {
      if (!body.campaignId) {
        return NextResponse.json({ success: false, error: 'campaignId required' }, { status: 400 })
      }
      await assignCampaignToFunnel({
        campaignId: body.campaignId,
        funnelId,
        cascade: body.cascade !== false,
        actorId: auth.user.id,
      })
      await writeMarketingAudit({
        agent: 'funnels',
        decision: 'campaign_assigned',
        actor_id: auth.user.id,
        execution_result: {
          campaign_id: body.campaignId,
          funnel_id: funnelId,
          label: funnelId ? 'classified' : 'UNCLASSIFIED',
        },
      })
      return NextResponse.json({ success: true })
    }

    if (body.action === 'assign_creative') {
      if (!body.creativeId) {
        return NextResponse.json({ success: false, error: 'creativeId required' }, { status: 400 })
      }
      await assignCreativeToFunnel({ creativeId: body.creativeId, funnelId })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
