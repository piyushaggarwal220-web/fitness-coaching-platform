/**
 * Morning business brief — concise, evidence-backed, no fluff.
 */

import { BUSINESS_TIMEZONE, zonedYmd } from '@/lib/time/business-calendar'
import type { MorningBriefStructured, UnifiedObservation } from '@/lib/jarvis/autonomous/types'

function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'unavailable'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function buildMorningBrief(
  obs: UnifiedObservation,
  opts?: { pendingApprovalLabel?: string | null }
): { text: string; structured: MorningBriefStructured; meaningful: boolean } {
  const date = zonedYmd(new Date(obs.observed_at), obs.timezone || BUSINESS_TIMEZONE)
  const rev = obs.revenue as {
    today?: { gross_inr?: number | null }
    yesterday?: { gross_inr?: number | null }
  }
  const today = rev.today?.gross_inr
  const yday = rev.yesterday?.gross_inr
  let change = ''
  if (typeof today === 'number' && typeof yday === 'number' && yday > 0) {
    const pct = Math.round(((today - yday) / yday) * 100)
    change = `${pct >= 0 ? '+' : ''}${pct}% vs yesterday`
  }

  const content = obs.content as {
    needs_review?: number
    scheduled?: number
    blocked?: number
    needs_attention?: number
  }

  const important = obs.findings
    .filter((f) => f.severity === 'WARNING' || f.severity === 'CRITICAL')
    .slice(0, 4)
    .map((f) => f.title)

  const topFinding = obs.findings.find(
    (f) => f.severity === 'CRITICAL' || f.severity === 'WARNING'
  )
  const recommended =
    topFinding?.next_action && topFinding.title
      ? `${topFinding.next_action}: ${topFinding.title}`
      : obs.opportunities[0]
        ? obs.opportunities[0].recommendation[0] ?? null
        : null

  const structured: MorningBriefStructured = {
    date,
    timezone: obs.timezone || BUSINESS_TIMEZONE,
    revenue_line: `Revenue: ${inr(yday ?? today)} yesterday${change ? ` (${change})` : ''}`,
    marketing_line: (() => {
      const funnels = (obs.marketing as { by_funnel?: { spend?: number; cpa?: number | null }[] })
        .by_funnel
      if (!funnels?.length) return 'Marketing: performance data unavailable this window'
      const spend = funnels.reduce((a, f) => a + (f.spend ?? 0), 0)
      const withCpa = funnels.filter((f) => f.cpa != null)
      const cpa =
        withCpa.length > 0
          ? withCpa.reduce((a, f) => a + (f.cpa ?? 0), 0) / withCpa.length
          : null
      return `Marketing: spend ${inr(spend)} · avg CPA ${cpa != null ? inr(cpa) : 'n/a'} (7d funnel window)`
    })(),
    instagram_line: (() => {
      const ig = obs.instagram as {
        configured?: boolean
        stale_hours?: number | null
        live_publishing?: boolean
      }
      if (!ig.configured) return 'Instagram: NOT_CONFIGURED'
      if (ig.stale_hours != null && ig.stale_hours >= 48) {
        return `Instagram: metrics stale (~${Math.round(ig.stale_hours)}h) — performance unverified`
      }
      return `Instagram: connected · live publish ${ig.live_publishing ? 'ENABLED' : 'DISABLED'}`
    })(),
    content_line: `Content: ${content.needs_review ?? 0} review · ${content.scheduled ?? 0} scheduled · ${content.blocked ?? 0} blocked`,
    important,
    recommended_action: recommended,
    pending_approval: opts?.pendingApprovalLabel ?? null,
  }

  const lines = [
    'JARVIS — MORNING BRIEF',
    `Date: ${structured.date} (${structured.timezone})`,
    '',
    structured.revenue_line,
    structured.marketing_line,
    structured.instagram_line,
    structured.content_line,
  ]
  if (important.length) {
    lines.push('', 'Important:')
    for (const i of important) lines.push(`- ${i}`)
  }
  if (recommended) {
    lines.push('', `Recommended action: ${recommended}`)
  }
  if (structured.pending_approval) {
    lines.push(`Pending approval: ${structured.pending_approval}`)
  }

  const meaningful =
    important.length > 0 ||
    Boolean(recommended) ||
    Boolean(structured.pending_approval) ||
    (content.blocked ?? 0) > 0 ||
    (content.needs_review ?? 0) > 0

  return { text: lines.join('\n'), structured, meaningful }
}
