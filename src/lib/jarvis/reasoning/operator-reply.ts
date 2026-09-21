/**
 * Concise operator reply presentation.
 * Compresses the final natural-language answer only — does not change
 * investigation depth, tools, or source-of-truth logic.
 */

import { stripRawToolNamesFromReply } from '@/lib/jarvis/reasoning/boundaries'

export const OPERATOR_REPLY_SOFT_WORD_LIMIT = 250
export const OPERATOR_REPLY_HARD_WORD_LIMIT = 300

const FILLER =
  /\b(based on the available evidence|it is important to note|furthermore|in particular|therefore,? it should be emphasized|as previously mentioned|to summarize|in conclusion|it should be noted that|from the data above)\b[,:]?\s*/gi

const META_UNAVAILABLE_THEME =
  /\bmeta\b.{0,80}\b(unavailable|not (?:decision[- ]?grade|usable)|cannot (?:be )?(?:used|evaluated|treated)|not (?:verified|synced)|no (?:successful )?sync|lastsyncat\s*(?:is\s*)?null)\b/i

export type OperatorReplyMode = 'brief' | 'business' | 'investigation' | 'approval' | 'detailed'

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function userRequestedDetail(message: string): boolean {
  const q = message.toLowerCase()
  return (
    /\b(show (me )?(everything|all|full|complete)|detailed? (report|evidence|trace|diagnostic)|full (report|diagnostic|evidence|trace)|technical trace|dump (the )?evidence|every (probe|step|check))\b/.test(
      q
    ) || /\bshow (me )?evidence\b/.test(q) || /\bview details\b/.test(q)
  )
}

export function detectOperatorReplyMode(
  message: string,
  opts?: { hasApprovals?: boolean }
): OperatorReplyMode {
  if (userRequestedDetail(message)) return 'detailed'
  if (opts?.hasApprovals) return 'approval'
  const q = message.toLowerCase()
  if (
    /\b(why|investigate|diagnos|root cause|what'?s wrong|unavailable|missing|broken|failing)\b/.test(q)
  ) {
    return 'investigation'
  }
  if (
    /\b(how is the business|what'?s happening|today'?s brief|what should i do|how are ads|business doing|give me (a |today'?s )?brief)\b/.test(
      q
    )
  ) {
    return 'business'
  }
  return 'brief'
}

export function operatorComposeSystemPrompt(mode: OperatorReplyMode): string {
  const shared = `You are JARVIS for LURVOX — an intelligent operator briefing the owner, not a consultant writing a report.
Think deeply internally. Report briefly. Target 100–250 words (hard cap ~300 unless detail was requested).
Use direct business language. No filler ("Based on the available evidence…", "Furthermore…", "It is important to note…").
Do not repeat the same conclusion in different words.
Do NOT append raw tool names or execution traces.
If a metric has data_status failed/unavailable/unknown, say unavailable — never ₹0.
Never reconcile LURVOX Razorpay (public.purchases) with Shopify unless a verified link exists.
Never assign funnel_id from purchase price alone.
Separate ₹99 and ₹1,699 funnel economics.`

  if (mode === 'detailed') {
    return `${shared}
The owner asked for detail. You may expand, but still use progressive structure (Finding → Evidence → Unknown → Next step). Prefer sections over dumping every probe.`
  }

  if (mode === 'approval') {
    return `${shared}
Format exactly:
## ACTION
one line
## WHY
1–2 sentences
## EVIDENCE
max 3 bullets
## RISK
one short line
End with: Reply Approve or Reject in Approvals.
Decision-complete but concise — no essay.`
  }

  if (mode === 'investigation') {
    return `${shared}
Format exactly:
## Finding
1–2 sentences
## Evidence
Maximum 3 bullets (only what supports the finding)
## Unknown
One short line if something is unknown; omit if nothing material is unknown
## Next step
One recommendation
Do not dump full diagnostic stages, every API probe, or exhaustive test plans.`
  }

  if (mode === 'business') {
    return `${shared}
Format exactly:
## Bottom line
1–2 sentences with key numbers if available
## What I found
Maximum 3 bullets
## What needs attention
Maximum 2 bullets (omit section if nothing)
## Next step
One recommendation
This is a brief, not a formal report.`
  }

  return `${shared}
Format exactly:
## Bottom line
1–2 sentences
## What I found
Maximum 3 bullets
## What needs attention
Maximum 2 bullets (omit if none)
## Next step
One recommendation`
}

function stripFiller(text: string): string {
  return text.replace(FILLER, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function splitSections(text: string): { heading: string; body: string }[] {
  const lines = text.split(/\r?\n/)
  const sections: { heading: string; body: string }[] = []
  let heading = ''
  let body: string[] = []
  const flush = () => {
    const b = body.join('\n').trim()
    if (heading || b) sections.push({ heading, body: b })
    heading = ''
    body = []
  }
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.+)\s*$/)
    if (h) {
      flush()
      heading = h[1].trim()
      continue
    }
    body.push(line)
  }
  flush()
  return sections
}

function bulletsFrom(text: string, max: number): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((l) => l.length > 0 && !/^#{1,3}\s/.test(l))
  if (lines.length >= 2) return lines.slice(0, max)
  // Sentence split fallback
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, max)
}

function dedupeThematicSentences(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/)
  const kept: string[] = []
  let sawMetaUnavailable = false
  for (const part of parts) {
    if (META_UNAVAILABLE_THEME.test(part)) {
      if (sawMetaUnavailable) continue
      sawMetaUnavailable = true
    }
    kept.push(part)
  }
  return kept.join(' ').replace(/[ \t]{2,}/g, ' ').trim()
}

function formatBullets(items: string[]): string {
  return items.map((i) => `- ${i.replace(/^[-*•]\s+/, '')}`).join('\n')
}

function pickSection(
  sections: { heading: string; body: string }[],
  names: RegExp
): string {
  const hit = sections.find((s) => names.test(s.heading))
  return hit?.body?.trim() || ''
}

/**
 * Deterministic compression when the model still returns a long reply.
 * Preserves conclusion, strongest evidence, important unknown, next action.
 */
export function compressOperatorReply(
  draft: string,
  opts: { mode: OperatorReplyMode; userMessage?: string }
): string {
  let text = stripRawToolNamesFromReply(draft)
  text = stripFiller(text)

  if (opts.mode === 'detailed') return text.trim()

  const words = countWords(text)
  const sections = splitSections(text)
  const hasExpectedHeadings = sections.some((s) =>
    /^(bottom line|finding|what i found|evidence|next step|action|why)$/i.test(s.heading)
  )
  const looksLikeDump =
    /diagnostic stages|test plan|health checks|source of truth explanations/i.test(text) ||
    (text.match(/^\d+\.\s+/gm) || []).length >= 4

  const needsForce =
    words > OPERATOR_REPLY_SOFT_WORD_LIMIT ||
    !hasExpectedHeadings ||
    looksLikeDump

  if (!needsForce) {
    return enforceSectionCaps(text, opts.mode).trim()
  }

  if (!needsForce) {
    return enforceSectionCaps(text, opts.mode).trim()
  }

  // Keep original section map; sentence dedupe is applied to finding prose only.
  const sourceSections = sections
  if (opts.mode === 'approval') {
    const action =
      pickSection(sourceSections, /^action$/i) ||
      bulletsFrom(text, 1)[0] ||
      text.split(/\n/)[0] ||
      'Action pending approval'
    const why = dedupeThematicSentences(
      pickSection(sourceSections, /^why$/i) || bulletsFrom(text, 2).slice(0, 2).join(' ')
    )
    const evidence = bulletsFrom(pickSection(sourceSections, /^evidence$/i) || text, 3)
    const risk = pickSection(sourceSections, /^risk$/i) || 'Review before approving.'
    return [
      '## ACTION',
      action.split(/\n/)[0].slice(0, 200),
      '',
      '## WHY',
      why.slice(0, 320),
      '',
      '## EVIDENCE',
      formatBullets(evidence),
      '',
      '## RISK',
      risk.split(/\n/)[0].slice(0, 200),
    ].join('\n')
  }

  if (opts.mode === 'investigation') {
    const findingRaw =
      pickSection(sourceSections, /^(finding|bottom line|conclusion|diagnosis)$/i) ||
      sourceSections[0]?.body ||
      text
    const finding = dedupeThematicSentences(findingRaw)
    const dumpBody =
      pickSection(sourceSections, /^(diagnostic stages|evidence|what i found|findings)$/i) || ''
    const evidenceBody = dumpBody || finding
    const unknown =
      pickSection(sourceSections, /^(unknown|unavailable|what is unavailable|caveats?)$/i) ||
      (/lastsyncat|never (been )?verified|no successful sync/i.test(text)
        ? 'Exact sync failure point is not recorded.'
        : '')
    const next =
      pickSection(sourceSections, /^(next step|recommended|action|recommendation)$/i) ||
      'Investigate the highest-confidence unknown next.'
    const findingShort = bulletsFrom(finding, 2).join(' ').slice(0, 280) || finding.slice(0, 280)
    const evidenceBullets = bulletsFrom(evidenceBody, 3)
    const out = [
      '## Finding',
      findingShort,
      '',
      '## Evidence',
      formatBullets(evidenceBullets.length ? evidenceBullets : bulletsFrom(text, 3)),
    ]
    if (unknown.trim()) {
      out.push('', '## Unknown', unknown.split(/\n/).filter(Boolean)[0].slice(0, 200))
    }
    out.push('', '## Next step', next.split(/\n/).filter(Boolean)[0].slice(0, 220))
    return out.join('\n')
  }

  // brief / business
  const bottomRaw =
    pickSection(sourceSections, /^(bottom line|conclusion|summary|finding)$/i) ||
    sourceSections[0]?.body ||
    text
  const bottom = dedupeThematicSentences(bottomRaw)
  const found =
    pickSection(sourceSections, /^(what i found|evidence|key numbers|findings|diagnostic stages)$/i) ||
    bottom
  const attention =
    pickSection(sourceSections, /^(what needs attention|attention|problem|unavailable)$/i) || ''
  const next =
    pickSection(sourceSections, /^(next step|recommended|action|recommendation)$/i) ||
    'No change proposed until the open gap is verified.'

  const bottomShort = bulletsFrom(bottom, 2).join(' ').slice(0, 280) || bottom.slice(0, 280)
  const foundBullets = bulletsFrom(found, 3)
  const attentionBullets = attention ? bulletsFrom(attention, 2) : []

  const parts = ['## Bottom line', bottomShort, '', '## What I found', formatBullets(foundBullets)]
  if (attentionBullets.length) {
    parts.push('', '## What needs attention', formatBullets(attentionBullets))
  }
  parts.push('', '## Next step', next.split(/\n/).filter(Boolean)[0].slice(0, 220))
  return parts.join('\n')
}

function enforceSectionCaps(text: string, mode: OperatorReplyMode): string {
  if (mode === 'detailed') return text
  const sections = splitSections(text)
  if (sections.length < 2) return text
  return sections
    .map((s) => {
      const h = s.heading.toLowerCase()
      if (/evidence|what i found|findings/.test(h)) {
        return `## ${s.heading}\n${formatBullets(bulletsFrom(s.body, 3))}`
      }
      if (/attention|problem/.test(h)) {
        return `## ${s.heading}\n${formatBullets(bulletsFrom(s.body, 2))}`
      }
      if (/unknown/.test(h)) {
        const line = s.body.split(/\n/).filter(Boolean)[0] || s.body
        return `## ${s.heading}\n${line.slice(0, 220)}`
      }
      if (/bottom line|finding|why|action|risk|next/.test(h)) {
        return `## ${s.heading}\n${s.body.split(/\n\n/)[0].slice(0, 320)}`
      }
      return s.heading ? `## ${s.heading}\n${s.body}` : s.body
    })
    .join('\n\n')
}

/**
 * Final presentation pipeline for orchestrator compose output.
 */
export function presentOperatorReply(input: {
  userMessage: string
  draft: string
  hasApprovals?: boolean
}): { text: string; mode: OperatorReplyMode; compressed: boolean; word_count: number } {
  const mode = detectOperatorReplyMode(input.userMessage, {
    hasApprovals: input.hasApprovals,
  })
  const before = stripRawToolNamesFromReply(input.draft)
  const after = compressOperatorReply(before, { mode, userMessage: input.userMessage })
  return {
    text: after,
    mode,
    compressed: after !== before.trim() || countWords(before) > OPERATOR_REPLY_HARD_WORD_LIMIT,
    word_count: countWords(after),
  }
}
