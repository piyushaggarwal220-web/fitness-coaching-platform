/**
 * “What happened while I was away?” summary — evidence-backed.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { listOpenAttention, getLatestMorningBrief } from '@/lib/jarvis/autonomous/store'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import type { AwaySummary } from '@/lib/jarvis/autonomous/types'

export async function buildAwaySummary(opts?: {
  sinceHours?: number
}): Promise<{ text: string; summary: AwaySummary }> {
  const sinceHours = opts?.sinceHours ?? 12
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const admin = createAdminClient()

  const [attention, brief, approvals, jobs, digests] = await Promise.all([
    listOpenAttention(20),
    getLatestMorningBrief(),
    listPendingApprovals(10).catch(() => []),
    (async () => {
      try {
        const { data } = await admin
          .from('jarvis_background_jobs')
          .select('job_type, status, result, error, created_at, completed_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(15)
        return data ?? []
      } catch {
        return []
      }
    })(),
    (async () => {
      try {
        const { data } = await admin
          .from('jarvis_activity_digests')
          .select('*')
          .order('digest_date', { ascending: false })
          .limit(2)
        return data ?? []
      } catch {
        return []
      }
    })(),
  ])

  const summary: AwaySummary = {
    business: [],
    marketing: [],
    instagram: [],
    content: [],
    actions_taken: [],
    waiting_approval: (approvals as { action_label?: string; tool_name?: string }[]).map(
      (a) => String(a.action_label || a.tool_name || 'approval')
    ),
    problems: [],
    opportunities: [],
    recommend_next: [],
    limitations: [
      'Only evidence from stored observations/jobs/approvals is listed.',
      'Absence of a line does not mean the system was idle — only that nothing meaningful was recorded.',
    ],
  }

  if (brief?.text) {
    summary.business.push(`Latest brief (${brief.brief_date}) available.`)
  }

  for (const a of attention) {
    const line = `[${a.severity}] ${a.system}: ${a.title}`
    if (/meta|marketing|cpa|roas/i.test(a.system + a.title)) summary.marketing.push(line)
    else if (/instagram|ig/i.test(a.system + a.title)) summary.instagram.push(line)
    else if (/content/i.test(a.system + a.title)) summary.content.push(line)
    else summary.business.push(line)

    if (a.severity === 'WARNING' || a.severity === 'CRITICAL') {
      summary.problems.push(line)
    }
    if (a.diagnosis?.recommendation?.[0]) {
      summary.recommend_next.push(a.diagnosis.recommendation[0])
    }
  }

  for (const j of jobs as { job_type?: string; status?: string; result?: unknown }[]) {
    if (j.status === 'completed') {
      summary.actions_taken.push(`${j.job_type}: completed`)
    } else if (j.status === 'failed' || j.status === 'budget_exhausted') {
      summary.problems.push(`${j.job_type}: ${j.status}`)
    }
  }

  for (const d of digests as { actions?: string[]; recommends?: string[]; summary?: string }[]) {
    for (const a of d.actions ?? []) summary.actions_taken.push(a)
    for (const r of d.recommends ?? []) summary.recommend_next.push(r)
  }

  // Phase 13 — event aggregation
  try {
    const { listRecentEvents, summarizeEventsForBrief } = await import('@/lib/jarvis/events')
    const recent = (await listRecentEvents(50)).filter((e) => Date.parse(e.created_at) >= Date.parse(since))
    const lines = summarizeEventsForBrief(recent)
    const investigated = recent.filter((e) =>
      ['INVESTIGATE', 'ALERT', 'URGENT'].includes(String(e.significance))
    ).length
    const completed = recent.filter((e) => ['COMPLETED', 'processed'].includes(e.status)).length
    if (lines.length) {
      summary.business.push(
        `While you were away: ${recent.length} event(s); ${investigated} needed investigation; ${completed} completed/processed.`
      )
      for (const l of lines.slice(0, 6)) {
        if (/meta|cpa|roas|spend/i.test(l)) summary.marketing.push(l)
        else if (/instagram|content/i.test(l)) summary.instagram.push(l)
        else summary.business.push(l)
      }
    }
  } catch {
    /* migration pending */
  }

  // Phase 14 — strategic learning while away
  try {
    const { buildBusinessKnowledgeSnapshot, listOpenConflicts } = await import(
      '@/lib/jarvis/memory/strategic'
    )
    const snap = await buildBusinessKnowledgeSnapshot()
    const conflicts = await listOpenConflicts(3)
    if (snap.strategic_patterns[0]) {
      summary.opportunities.push(`Strategic pattern: ${snap.strategic_patterns[0]}`)
    }
    if (snap.recent_failures[0]) summary.problems.push(`Lesson: ${snap.recent_failures[0]}`)
    for (const c of conflicts) summary.problems.push(`Memory conflict: ${c.reason.slice(0, 120)}`)
  } catch {
    /* Phase 14 optional */
  }

  // Phase 15–20 — opportunities / goals / experiments (bounded)
  try {
    const { reviewOpportunities } = await import('@/lib/jarvis/opportunities')
    const rev = await reviewOpportunities()
    for (const o of [...((rev.critical as { title?: string }[]) || []), ...((rev.high as { title?: string }[]) || [])].slice(0, 3)) {
      if (o.title) summary.opportunities.push(o.title)
    }
  } catch {
    /* optional */
  }
  try {
    const { listExperiments } = await import('@/lib/jarvis/experiments')
    const exps = (await listExperiments(5)).filter(
      (e) => e.status === 'running' || e.jarvis_lifecycle === 'RUNNING'
    )
    for (const e of exps.slice(0, 2)) {
      summary.business.push(`Active experiment: ${e.name}`)
    }
  } catch {
    /* optional */
  }

  // Dedupe lines
  for (const key of Object.keys(summary) as (keyof AwaySummary)[]) {
    if (Array.isArray(summary[key])) {
      summary[key] = [...new Set(summary[key] as string[])].slice(0, 12) as never
    }
  }

  const text = [
    'OVERNIGHT SUMMARY',
    '',
    'Business:',
    ...(summary.business.length ? summary.business.map((l) => `- ${l}`) : ['- No open business attention items']),
    '',
    'Marketing:',
    ...(summary.marketing.length ? summary.marketing.map((l) => `- ${l}`) : ['- No open marketing attention items']),
    '',
    'Instagram:',
    ...(summary.instagram.length ? summary.instagram.map((l) => `- ${l}`) : ['- No open Instagram attention items']),
    '',
    'Content:',
    ...(summary.content.length ? summary.content.map((l) => `- ${l}`) : ['- No open content attention items']),
    '',
    'Actions taken:',
    ...(summary.actions_taken.length
      ? summary.actions_taken.map((l) => `- ${l}`)
      : ['- None recorded in window']),
    '',
    'Waiting for approval:',
    ...(summary.waiting_approval.length
      ? summary.waiting_approval.map((l) => `- ${l}`)
      : ['- None']),
    '',
    'Problems:',
    ...(summary.problems.length ? summary.problems.map((l) => `- ${l}`) : ['- None flagged']),
    '',
    'Opportunities:',
    ...(summary.opportunities.length
      ? summary.opportunities.map((l) => `- ${l}`)
      : ['- None recorded']),
    '',
    'What I recommend next:',
    ...(summary.recommend_next.length
      ? summary.recommend_next.map((l) => `- ${l}`)
      : ['- Review attention queue if any WARNING/CRITICAL items exist']),
  ].join('\n')

  return { text, summary }
}
