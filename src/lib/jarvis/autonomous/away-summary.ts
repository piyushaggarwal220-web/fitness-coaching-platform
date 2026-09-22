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
