import { createAdminClient } from '@/lib/supabase/admin'
import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import { z } from 'zod'

const funnelDiagnosisTextSchema = z.object({
  diagnosis: z.string().min(10).max(2000),
  trend: z.enum(['improving', 'stable', 'declining', 'insufficient_data']),
  recommended_actions: z.array(z.string()).min(1).max(5),
})

const narrativeSchema = z.object({
  what_changed: z.array(z.string()).min(1).max(8),
  what_matters: z.array(z.string()).min(1).max(8),
  what_should_we_do_next: z.array(z.string()).min(1).max(8),
})

export type DailyFunnelReportBlock = {
  funnel_id: string | null
  title: string
  spend: number
  revenue: number
  purchases: number
  cpa: number | null
  roas: number | null
  initial_roas: number | null
  blended_customer_value: number | null
  blended_roas: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  conversion_rate: number | null
  trend: string
  ai_diagnosis: string
  price_inr?: number | null
  target_cpa?: number | null
  max_acceptable_cpa?: number | null
  target_roas?: number | null
  top_creative?: string | null
  worst_creative?: string | null
  creative_fatigue?: string | null
}

export type DailyBusinessReport = {
  report_date: string
  funnels: DailyFunnelReportBlock[]
  unclassified: DailyFunnelReportBlock | null
  business_total: DailyFunnelReportBlock
  recommended_actions: string[]
  what_changed: string[]
  what_matters: string[]
  what_should_we_do_next: string[]
  text: string
}

function formatBlock(b: DailyFunnelReportBlock): string {
  return [
    `=====================`,
    b.title,
    `=====================`,
    `Spend: ${b.spend}`,
    `Revenue: ${b.revenue}`,
    `Purchases: ${b.purchases}`,
    `CPA: ${b.cpa ?? '—'}`,
    `ROAS: ${b.initial_roas ?? b.roas ?? '—'}`,
    `CTR: ${b.ctr ?? '—'}`,
    `CPC: ${b.cpc ?? '—'}`,
    `CPM: ${b.cpm ?? '—'}`,
    `Conversion rate: ${b.conversion_rate ?? '—'}`,
    b.top_creative ? `Top creative: ${b.top_creative}` : '',
    b.worst_creative ? `Worst creative: ${b.worst_creative}` : '',
    b.creative_fatigue ? `Creative fatigue: ${b.creative_fatigue}` : '',
    `Trend: ${b.trend}`,
    `AI diagnosis: ${b.ai_diagnosis}`,
    b.target_cpa != null ? `Funnel target CPA: ₹${b.target_cpa}` : '',
    b.max_acceptable_cpa != null ? `Funnel max CPA: ₹${b.max_acceptable_cpa}` : '',
    b.target_roas != null ? `Funnel target ROAS: ${b.target_roas}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function buildDailyFunnelReport(opts?: {
  actorId?: string | null
  analysis?: unknown
  brain?: unknown
  days?: number
}): Promise<DailyBusinessReport> {
  const admin = createAdminClient()
  const reportDate = new Date().toISOString().slice(0, 10)
  const days = opts?.days ?? 7
  const perf = await getPerformanceByFunnel({ days })
  const funnels = await listFunnels()
  const creativeRows = await listCreativePerformance({ days: Math.max(days, 14) })

  const funnelBlocks: DailyFunnelReportBlock[] = []
  const allActions: string[] = []

  for (const summary of perf.byFunnel) {
    const funnel = funnels.find((f) => f.id === summary.funnel_id) ?? null
    let diagnosis = 'Insufficient structured diagnosis.'
    let trend: DailyFunnelReportBlock['trend'] = 'insufficient_data'
    let actions: string[] = ['Continue collecting data']

    const funnelCreatives = creativeRows.filter((c) => c.funnel_id === summary.funnel_id)
    const ranked = [...funnelCreatives].sort((a, b) => {
      const aScore = (a.roas ?? 0) * 1000 + a.purchases * 10 - (a.cpa ?? 99999)
      const bScore = (b.roas ?? 0) * 1000 + b.purchases * 10 - (b.cpa ?? 99999)
      return bScore - aScore
    })
    const withSpend = ranked.filter((c) => c.spend > 0)
    const top = withSpend[0]
    const worst = withSpend.length > 1 ? withSpend[withSpend.length - 1] : null
    const fatigued = funnelCreatives.filter(
      (c) => c.classification === 'FATIGUED' || c.classification === 'DECLINING'
    )

    try {
      const { data } = await generateMarketingJson({
        systemPrompt: `Write a concise diagnosis for ONE LURVOX funnel.
Use that funnel's target CPA/ROAS only. Distinguish initial ROAS vs blended value.
Never apply another funnel's thresholds. Do not invent spend figures.`,
        userPrompt: JSON.stringify({
          funnel,
          summary,
          top_creative: top,
          worst_creative: worst,
          fatigued_creatives: fatigued.slice(0, 5),
        }),
        schema: funnelDiagnosisTextSchema,
        maxTokens: 1200,
      })
      diagnosis = data.diagnosis
      trend = data.trend
      actions = data.recommended_actions
    } catch {
      diagnosis = `Spend ${summary.spend}, CPA ${summary.cpa}, initial ROAS ${summary.initial_roas}.`
      if (summary.cpa != null && funnel) {
        if (summary.cpa <= funnel.target_cpa) diagnosis += ' CPA at/under target — positive.'
        else if (summary.cpa <= funnel.max_acceptable_cpa)
          diagnosis += ' CPA between target and max — inefficient, not auto-pause.'
        else diagnosis += ' CPA above max — strong negative signal.'
      }
      trend = summary.spend > 0 ? 'stable' : 'insufficient_data'
    }

    allActions.push(...actions.map((a) => `[${summary.funnel_name}] ${a}`))

    const block: DailyFunnelReportBlock = {
      funnel_id: summary.funnel_id,
      title: summary.funnel_name.toUpperCase(),
      spend: summary.spend,
      revenue: summary.revenue,
      purchases: summary.purchases,
      cpa: summary.cpa,
      roas: summary.initial_roas,
      initial_roas: summary.initial_roas,
      blended_customer_value: summary.blended_customer_value,
      blended_roas: summary.blended_roas,
      ctr: summary.ctr,
      cpc: summary.cpc,
      cpm: summary.cpm,
      conversion_rate: summary.conversion_rate,
      trend,
      ai_diagnosis: diagnosis,
      price_inr: summary.price_inr,
      target_cpa: summary.target_cpa,
      max_acceptable_cpa: summary.max_acceptable_cpa,
      target_roas: summary.target_roas,
      top_creative: top
        ? `${top.name} (${top.classification}, CPA ${top.cpa ?? '—'}, ROAS ${top.roas ?? '—'})`
        : null,
      worst_creative: worst
        ? `${worst.name} (${worst.classification}, CPA ${worst.cpa ?? '—'}, ROAS ${worst.roas ?? '—'})`
        : null,
      creative_fatigue:
        fatigued.length > 0
          ? fatigued.map((c) => `${c.name}=${c.classification}`).join(', ')
          : 'None flagged',
    }
    funnelBlocks.push(block)

    await admin.from('marketing_funnel_daily_reports').upsert(
      {
        report_date: reportDate,
        funnel_id: summary.funnel_id,
        spend: block.spend,
        revenue: block.revenue,
        purchases: block.purchases,
        cpa: block.cpa,
        roas: block.initial_roas,
        ctr: block.ctr,
        cpc: block.cpc,
        cpm: block.cpm,
        conversion_rate: block.conversion_rate,
        initial_roas: block.initial_roas,
        blended_customer_value: block.blended_customer_value,
        downstream_revenue: summary.downstream_revenue,
        trend: block.trend,
        ai_diagnosis: block.ai_diagnosis,
        recommended_actions: actions,
        metrics: {
          summary,
          top_creative: top ?? null,
          worst_creative: worst ?? null,
          fatigued,
        },
      },
      { onConflict: 'report_date,funnel_id' }
    )
  }

  const unclassifiedBlock: DailyFunnelReportBlock | null =
    perf.unclassified.spend > 0
      ? {
          funnel_id: null,
          title: 'UNCLASSIFIED',
          spend: perf.unclassified.spend,
          revenue: perf.unclassified.revenue,
          purchases: perf.unclassified.purchases,
          cpa: perf.unclassified.cpa,
          roas: perf.unclassified.initial_roas,
          initial_roas: perf.unclassified.initial_roas,
          blended_customer_value: null,
          blended_roas: null,
          ctr: perf.unclassified.ctr,
          cpc: perf.unclassified.cpc,
          cpm: perf.unclassified.cpm,
          conversion_rate: perf.unclassified.conversion_rate,
          trend: 'insufficient_data',
          ai_diagnosis:
            'Spend is not assigned to a funnel. Classify campaigns before optimizing against offer economics.',
        }
      : null

  const totalActions = allActions.slice(0, 5)
  if (totalActions.length < 3) {
    totalActions.push('Review unclassified campaigns and assign funnels')
  }

  const businessTotal: DailyFunnelReportBlock = {
    funnel_id: null,
    title: 'BUSINESS TOTAL',
    spend: perf.blended.spend,
    revenue: perf.blended.revenue,
    purchases: perf.blended.purchases,
    cpa: perf.blended.cpa,
    roas: perf.blended.initial_roas,
    initial_roas: perf.blended.initial_roas,
    blended_customer_value: perf.blended.blended_customer_value,
    blended_roas: perf.blended.blended_roas,
    ctr: perf.blended.ctr,
    cpc: perf.blended.cpc,
    cpm: perf.blended.cpm,
    conversion_rate: perf.blended.conversion_rate,
    trend: 'stable',
    ai_diagnosis: `Contribution by funnel: ${perf.byFunnel
      .map(
        (f) =>
          `${f.funnel_name} spend ${f.spend} (${perf.blended.spend ? ((f.spend / perf.blended.spend) * 100).toFixed(1) : 0}%)`
      )
      .join('; ')}`,
  }

  let what_changed = ['Sync and review Meta performance for classified funnels.']
  let what_matters = funnelBlocks.map(
    (b) =>
      `${b.title}: CPA ${b.cpa ?? '—'} vs target ${b.target_cpa ?? '—'} / max ${b.max_acceptable_cpa ?? '—'}`
  )
  let what_should_we_do_next = totalActions

  try {
    const { data: narrative } = await generateMarketingJson({
      systemPrompt: `You are the LURVOX marketing operator writing a daily brief.
Be concrete. Separate funnels. Never blend ₹99 and ₹1,699 economics.
Do not invent metrics not present in the payload.`,
      userPrompt: JSON.stringify({
        report_date: reportDate,
        funnels: funnelBlocks,
        unclassified: unclassifiedBlock,
        business_total: businessTotal,
      }),
      schema: narrativeSchema,
      maxTokens: 1500,
    })
    what_changed = narrative.what_changed
    what_matters = narrative.what_matters
    what_should_we_do_next = narrative.what_should_we_do_next
  } catch {
    // keep heuristic defaults
  }

  await admin.from('marketing_funnel_daily_reports').upsert(
    {
      report_date: reportDate,
      funnel_id: null,
      spend: businessTotal.spend,
      revenue: businessTotal.revenue,
      purchases: businessTotal.purchases,
      cpa: businessTotal.cpa,
      roas: businessTotal.initial_roas,
      ctr: businessTotal.ctr,
      cpc: businessTotal.cpc,
      cpm: businessTotal.cpm,
      conversion_rate: businessTotal.conversion_rate,
      initial_roas: businessTotal.initial_roas,
      blended_customer_value: businessTotal.blended_customer_value,
      trend: businessTotal.trend,
      ai_diagnosis: businessTotal.ai_diagnosis,
      recommended_actions: what_should_we_do_next,
      metrics: {
        by_funnel: perf.byFunnel,
        unclassified: perf.unclassified,
        what_changed,
        what_matters,
        what_should_we_do_next,
      },
    },
    { onConflict: 'report_date,funnel_id' }
  )

  const text = [
    ...funnelBlocks.map(formatBlock),
    unclassifiedBlock ? formatBlock(unclassifiedBlock) : '',
    formatBlock(businessTotal),
    `=====================`,
    `WHAT CHANGED?`,
    `=====================`,
    ...what_changed.map((l, i) => `${i + 1}. ${l}`),
    ``,
    `=====================`,
    `WHAT MATTERS?`,
    `=====================`,
    ...what_matters.map((l, i) => `${i + 1}. ${l}`),
    ``,
    `=====================`,
    `WHAT SHOULD WE DO NEXT?`,
    `=====================`,
    ...what_should_we_do_next.map((l, i) => `${i + 1}. ${l}`),
  ]
    .filter((line) => line !== undefined)
    .join('\n\n')

  await writeMarketingAudit({
    agent: 'daily_report',
    decision: 'daily_multi_funnel_report',
    reasoning: text.slice(0, 1500),
    action: 'NOTIFY',
    actor_id: opts?.actorId ?? null,
    execution_result: { report_date: reportDate, funnel_count: funnelBlocks.length },
  })

  return {
    report_date: reportDate,
    funnels: funnelBlocks,
    unclassified: unclassifiedBlock,
    business_total: businessTotal,
    recommended_actions: what_should_we_do_next,
    what_changed,
    what_matters,
    what_should_we_do_next,
    text,
  }
}
