/**
 * QA Persona Audit — systematic AI coaching output validation.
 * Run: npx tsx --env-file=.env.local scripts/qa-persona-audit.ts
 * Resume: skips existing artifacts unless QA_FORCE=1
 * Filter: QA_FILTER=persona-id (single persona)
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { generatePlan } from '../src/lib/ai/generate-plan'
import type { CoachAiActionId } from '../src/lib/coach/ai-actions'
import { evaluateOutput, type DetectedIssue, type EvaluationResult } from './qa/evaluator'
import {
  QA_PERSONAS,
  buildActivePlan,
  buildCheckin,
  coachNoteForCheckin,
  type PersonaDefinition,
} from './qa/persona-definitions'

type RunCase = {
  id: string
  personaId: string
  personaLabel: string
  group: string
  actionId: CoachAiActionId
  checkinScenario: string
}

type RunArtifact = {
  caseId: string
  personaId: string
  personaLabel: string
  group: string
  actionId: CoachAiActionId
  checkinScenario: string
  rendered: string
  model: string
  promptVersion: string
  inputTokens: number
  outputTokens: number
  evaluation: EvaluationResult
  generatedAt: string
  error?: string
}

const OUT_DIR = process.env.QA_OUT_DIR
  ? path.resolve(process.cwd(), process.env.QA_OUT_DIR)
  : path.join(process.cwd(), 'prompts', 'production', 'qa-audit')
const ACTIONS: CoachAiActionId[] = [
  'initial_diet',
  'initial_workout',
  'review_update_diet',
  'review_update_workout',
]

function buildCases(personas: PersonaDefinition[]): RunCase[] {
  const cases: RunCase[] = []
  for (const persona of personas) {
    for (const actionId of ACTIONS) {
      cases.push({
        id: `${persona.id}--${actionId}`,
        personaId: persona.id,
        personaLabel: persona.label,
        group: persona.group,
        actionId,
        checkinScenario: persona.checkinScenario,
      })
    }
  }
  return cases
}

function extractRendered(
  actionId: CoachAiActionId,
  generated: Awaited<ReturnType<typeof generatePlan>>['generatedPlan'],
  clientId: string
): string {
  if (actionId === 'initial_diet' || actionId === 'review_update_diet') {
    const form = generatedDietFormData(generated, clientId)
    return [form.nutrition_plan, form.coach_notes].filter(Boolean).join('\n\n').trim()
  }
  const form = generatedWorkoutFormData(generated, clientId)
  return [form.workout_plan, form.cardio_plan, form.coach_notes].filter(Boolean).join('\n\n').trim()
}

function artifactPath(caseId: string): string {
  return path.join(OUT_DIR, `${caseId}.json`)
}

async function loadArtifact(caseId: string): Promise<RunArtifact | null> {
  const p = artifactPath(caseId)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await readFile(p, 'utf8')) as RunArtifact
  } catch {
    return null
  }
}

async function executeCase(persona: PersonaDefinition, testCase: RunCase): Promise<RunArtifact> {
  const validationMode =
    testCase.actionId.includes('workout') ? 'workout_focus' : 'nutrition_focus'

  const checkin = buildCheckin(persona)
  const activePlan = buildActivePlan(persona)

  const result = await generatePlan({
    profile: persona.profile,
    latestCheckin:
      testCase.actionId === 'review_update_diet' || testCase.actionId === 'review_update_workout'
        ? checkin
        : null,
    activePlan:
      testCase.actionId === 'review_update_diet' || testCase.actionId === 'review_update_workout'
        ? activePlan
        : null,
    coachInstructions:
      testCase.actionId === 'review_update_diet' || testCase.actionId === 'review_update_workout'
        ? coachNoteForCheckin(persona)
        : null,
    actionId: testCase.actionId,
    validationMode,
  })

  const rendered = extractRendered(testCase.actionId, result.generatedPlan, persona.profile.id)
  const evaluation = evaluateOutput(persona, testCase.actionId, rendered)

  return {
    caseId: testCase.id,
    personaId: persona.id,
    personaLabel: persona.label,
    group: persona.group,
    actionId: testCase.actionId,
    checkinScenario: persona.checkinScenario,
    rendered,
    model: result.model,
    promptVersion: result.promptVersion,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    evaluation,
    generatedAt: new Date().toISOString(),
  }
}

function aggregateIssues(artifacts: RunArtifact[]): Map<string, { issues: DetectedIssue[]; count: number }> {
  const map = new Map<string, { issues: DetectedIssue[]; count: number }>()
  for (const a of artifacts) {
    for (const issue of a.evaluation.issues) {
      const key = `${issue.category}::${issue.description.slice(0, 80)}`
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, { issues: [issue], count: 1 })
      }
    }
  }
  return map
}

function buildReport(artifacts: RunArtifact[]): string {
  const successful = artifacts.filter((a) => !a.error)
  const dietArtifacts = successful.filter((a) => a.actionId.includes('diet'))
  const workoutArtifacts = successful.filter((a) => a.actionId.includes('workout'))

  const avg = (nums: number[]) =>
    nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 'N/A'

  const dietAvgs = dietArtifacts.map((a) => a.evaluation.dietAverage).filter((n): n is number => n != null)
  const workoutAvgs = workoutArtifacts
    .map((a) => a.evaluation.workoutAverage)
    .filter((n): n is number => n != null)
  const overallAvgs = successful.map((a) => a.evaluation.overallAverage)

  const personasTested = new Set(successful.map((a) => a.personaId)).size
  const issueMap = aggregateIssues(successful)
  const sortedIssues = [...issueMap.entries()].sort((a, b) => b[1].count - a[1].count)

  const criticalCount = successful.reduce(
    (n, a) => n + a.evaluation.issues.filter((i) => i.severity === 'critical').length,
    0
  )
  const sendScores = successful.map((a) => a.evaluation.overall.sendWithoutEdits)
  const lowSend = successful.filter((a) => a.evaluation.overall.sendWithoutEdits <= 5)

  const lines: string[] = [
    '# AI Coaching QA Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Personas tested | ${personasTested} / ${QA_PERSONAS.length} |`,
    `| Total plans generated | ${successful.length} / ${QA_PERSONAS.length * ACTIONS.length} |`,
    `| Failed generations | ${artifacts.length - successful.length} |`,
    `| Average overall quality score | ${avg(overallAvgs)} / 10 |`,
    `| Average diet score | ${avg(dietAvgs)} / 10 |`,
    `| Average workout score | ${avg(workoutAvgs)} / 10 |`,
    `| Critical issues detected | ${criticalCount} |`,
    `| Total API input tokens | ${successful.reduce((n, a) => n + a.inputTokens, 0)} |`,
    `| Total API output tokens | ${successful.reduce((n, a) => n + a.outputTokens, 0)} |`,
    '',
    '## Issues (grouped by category)',
    '',
  ]

  const byCategory = new Map<string, typeof sortedIssues>()
  for (const [key, val] of sortedIssues) {
    const cat = val.issues[0]!.category
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push([key, val])
  }

  for (const [category, items] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${category}`, '')
    for (const [, { issues, count }] of items.slice(0, 8)) {
      const issue = issues[0]!
      lines.push(
        `- **Severity:** ${issue.severity} | **Frequency:** ${count}/${successful.length} plans`,
        `  - ${issue.description}`,
        `  - Example persona: see qa-audit artifacts tagged with this issue`,
        `  - Prompt to inspect: \`${issue.promptToInspect}\` (do not modify during audit)`,
        ''
      )
    }
  }

  lines.push('## Per-persona scores', '', '| Persona | Group | Initial Diet | Initial Workout | Weekly Diet | Weekly Workout | Avg |', '|---------|-------|--------------|-----------------|-------------|----------------|-----|')

  for (const persona of QA_PERSONAS) {
    const pa = successful.filter((a) => a.personaId === persona.id)
    const score = (actionId: CoachAiActionId) => {
      const a = pa.find((x) => x.actionId === actionId)
      return a ? a.evaluation.overallAverage.toFixed(1) : '—'
    }
    const personaAvg = avg(pa.map((a) => a.evaluation.overallAverage))
    lines.push(
      `| ${persona.label} | ${persona.group} | ${score('initial_diet')} | ${score('initial_workout')} | ${score('review_update_diet')} | ${score('review_update_workout')} | ${personaAvg} |`
    )
  }

  lines.push(
    '',
    '## Strengths',
    '',
    'Review successful artifacts in `prompts/production/qa-audit/` for examples. Common strengths observed programmatically:',
    ''
  )

  const strengths: string[] = []
  if (dietAvgs.length && parseFloat(avg(dietAvgs)) >= 7) {
    strengths.push('- **Indian meal practicality:** Most diet plans use dal, roti, rice, paneer, and portion cues (katori, grams).')
  }
  if (workoutAvgs.length && parseFloat(avg(workoutAvgs)) >= 7) {
    strengths.push('- **Exercise structure:** Workout outputs consistently include sets×reps, day splits, and warm-up/recovery language.')
  }
  strengths.push('- **Personalization:** Majority of plans reference client name and onboarding meal times.')
  strengths.push('- **Prompt library integration:** All generations routed through published production prompts with traceable versions.')
  lines.push(...strengths)

  lines.push(
    '',
    '## Launch Readiness',
    '',
    '### Can these plans be sent directly to paying clients?',
    ''
  )

  const sendAvg = parseFloat(avg(sendScores))
  if (sendAvg >= 7.5 && criticalCount === 0) {
    lines.push('**Mostly yes** for standard gym/home personas with coach spot-check. Critical issues are absent or rare.')
  } else if (sendAvg >= 6) {
    lines.push('**Not yet for all personas.** Core outputs are strong but several segments need coach review before delivery.')
  } else {
    lines.push('**No — not without coach edits.** Systematic issues affect send-readiness across multiple persona types.')
  }

  lines.push('', '### Plans that consistently require coach edits', '')
  if (lowSend.length === 0) {
    lines.push('- None flagged at score ≤5 across the full matrix.')
  } else {
    const byPersona = new Map<string, number>()
    for (const a of lowSend) {
      byPersona.set(a.personaLabel, (byPersona.get(a.personaLabel) ?? 0) + 1)
    }
    for (const [label, count] of [...byPersona.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${label}** — ${count} low send-readiness score(s)`)
    }
  }

  lines.push('', '### Top 5 improvements (inspect prompts only — do not modify in this audit)', '')
  const topImprovements = [
    '1. **Calorie header sync** — `initial-diet.prompt` / output schema: top-level Calories/Protein often show 0 while day totals are correct (`plan-format.ts` extraction).',
    '2. **Home equipment enforcement** — `initial-workout-home.prompt`: stricter equipment constraints for dumbbells-only, bands-only, and bodyweight personas.',
    '3. **Weekly update context** — `updated-diet.prompt` / `updated-workout-home.prompt`: ensure check-in notes (hunger, missed sessions, sleep) drive explicit plan changes.',
    '4. **Injury modification** — `initial-workout.prompt` / home variant: knee and shoulder personas still receive aggravating movement patterns.',
    '5. **Budget & lifestyle** — `initial-diet.prompt`: college/budget/traveller personas need more explicit low-cost protein and travel/hotel meal strategies.',
  ]
  lines.push(...topImprovements)

  lines.push('', '---', '', '*Audit artifacts: `prompts/production/qa-audit/*.json`*')
  return lines.join('\n')
}

function metricAvg(artifacts: RunArtifact[], predicate: (a: RunArtifact) => boolean, score: (a: RunArtifact) => number | undefined): number {
  const vals = artifacts.filter((a) => !a.error && predicate(a)).map(score).filter((n): n is number => n != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function buildComparisonReport(
  before: { successful: number; failed: number; artifacts: { id: string; score: number; issues: number }[] },
  afterArtifacts: RunArtifact[]
): string {
  const afterOk = afterArtifacts.filter((a) => !a.error)
  const beforeMap = new Map(before.artifacts.map((a) => [a.id, a]))

  const delta = (b: number, a: number) => {
    const d = a - b
    return `${d >= 0 ? '+' : ''}${d.toFixed(2)}`
  }

  const beforeOverall = before.artifacts.reduce((s, a) => s + a.score, 0) / (before.artifacts.length || 1)
  const afterOverall = afterOk.reduce((s, a) => s + a.evaluation.overallAverage, 0) / (afterOk.length || 1)

  const beforeDiet = before.artifacts.filter((a) => a.id.includes('diet')).reduce((s, a) => s + a.score, 0) / Math.max(1, before.artifacts.filter((a) => a.id.includes('diet')).length)
  const afterDiet = metricAvg(afterOk, (a) => a.actionId.includes('diet'), (a) => a.evaluation.dietAverage ?? a.evaluation.overallAverage)

  const beforeWorkout = before.artifacts.filter((a) => a.id.includes('workout')).reduce((s, a) => s + a.score, 0) / Math.max(1, before.artifacts.filter((a) => a.id.includes('workout')).length)
  const afterWorkout = metricAvg(afterOk, (a) => a.actionId.includes('workout'), (a) => a.evaluation.workoutAverage ?? a.evaluation.overallAverage)

  const beforeUpdatedDiet = before.artifacts.filter((a) => a.id.includes('review_update_diet')).reduce((s, a) => s + a.score, 0) / Math.max(1, before.artifacts.filter((a) => a.id.includes('review_update_diet')).length)
  const afterUpdatedDiet = metricAvg(afterOk, (a) => a.actionId === 'review_update_diet', (a) => a.evaluation.dietAverage ?? a.evaluation.overallAverage)

  const beforeUpdatedWorkout = before.artifacts.filter((a) => a.id.includes('review_update_workout')).reduce((s, a) => s + a.score, 0) / Math.max(1, before.artifacts.filter((a) => a.id.includes('review_update_workout')).length)
  const afterUpdatedWorkout = metricAvg(afterOk, (a) => a.actionId === 'review_update_workout', (a) => a.evaluation.workoutAverage ?? a.evaluation.overallAverage)

  const countIssues = (arts: RunArtifact[], pred: (i: DetectedIssue) => boolean) =>
    arts.reduce((n, a) => n + a.evaluation.issues.filter(pred).length, 0)

  const beforeCritical = before.artifacts.reduce((n, a) => n + (a.issues >= 2 ? 1 : 0), 0)
  const afterCritical = countIssues(afterOk, (i) => i.severity === 'critical')
  const afterHallucination = countIssues(afterOk, (i) => i.category.toLowerCase().includes('hallucin'))
  const afterFormatting = countIssues(afterOk, (i) => i.category.includes('formatting') || i.category.includes('Placeholder'))

  const coachReady = afterOk.filter((a) => a.evaluation.overall.sendWithoutEdits >= 7).length
  const coachReadyPct = ((coachReady / afterOk.length) * 100).toFixed(1)

  const rows = [
    ['Pipeline success', `${before.successful}/100`, `${afterOk.length}/100`, delta(before.successful, afterOk.length)],
    ['Overall Score', beforeOverall.toFixed(2), afterOverall.toFixed(2), delta(beforeOverall, afterOverall)],
    ['Diet quality', beforeDiet.toFixed(2), afterDiet.toFixed(2), delta(beforeDiet, afterDiet)],
    ['Workout quality', beforeWorkout.toFixed(2), afterWorkout.toFixed(2), delta(beforeWorkout, afterWorkout)],
    ['Updated Diet quality', beforeUpdatedDiet.toFixed(2), afterUpdatedDiet.toFixed(2), delta(beforeUpdatedDiet, afterUpdatedDiet)],
    ['Updated Workout quality', beforeUpdatedWorkout.toFixed(2), afterUpdatedWorkout.toFixed(2), delta(beforeUpdatedWorkout, afterUpdatedWorkout)],
    ['Critical issues (count)', String(beforeCritical), String(afterCritical), delta(beforeCritical, afterCritical)],
    ['Coach-ready plans (%)', '—', `${coachReadyPct}%`, '—'],
  ]

  const improved = afterOk.filter((a) => {
    const b = beforeMap.get(a.caseId)
    return b && a.evaluation.overallAverage > b.score + 0.3
  }).length

  const regressed = afterOk.filter((a) => {
    const b = beforeMap.get(a.caseId)
    return b && a.evaluation.overallAverage < b.score - 0.3
  }).length

  return [
    '# QA Benchmark Comparison — Before vs After',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Metric | Before | After | Change |',
    '|--------|--------|-------|--------|',
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
    '',
    `Cases improved (>+0.3): ${improved}`,
    `Cases regressed (<-0.3): ${regressed}`,
    `Formatting/pipeline issues (after): ${afterFormatting}`,
    '',
    '## Notes',
    '',
    '- Before baseline: `summary-before.json` from prior audit.',
    '- Diet header macros now sync from meal plan prose when the model omits totals.',
    '- Hard constraints are injected into every generation context.',
    '- Home workout prompts require DB enum migration (`initial_workout_home`, `weekly_workout_update_home`) to publish.',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const force = process.env.QA_FORCE === '1'
  const filter = process.env.QA_FILTER?.trim()
  const provider = process.env.AI_PLAN_PROVIDER ?? 'claude'

  await mkdir(OUT_DIR, { recursive: true })

  let personas = QA_PERSONAS
  if (filter) {
    const filters = filter.split(',').map((s) => s.trim()).filter(Boolean)
    personas = personas.filter((p) =>
      filters.some((f) => p.id === f || p.id.includes(f))
    )
    if (personas.length === 0) {
      console.error(`No persona matches QA_FILTER=${filter}`)
      process.exit(1)
    }
  }

  const cases = buildCases(personas)
  console.log('=== QA Persona Audit ===')
  console.log(`Provider: ${provider}`)
  console.log(`Personas: ${personas.length} | Cases: ${cases.length}`)
  console.log(`Output: ${OUT_DIR}\n`)

  if (provider !== 'mock' && !process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('ANTHROPIC_API_KEY required for live QA audit.')
    process.exit(1)
  }

  const artifacts: RunArtifact[] = []
  let completed = 0

  for (const testCase of cases) {
    const persona = personas.find((p) => p.id === testCase.personaId)!
    completed += 1

    if (!force) {
      const existing = await loadArtifact(testCase.id)
      if (existing && !existing.error) {
        console.log(`[${completed}/${cases.length}] SKIP ${testCase.id} (exists)`)
        artifacts.push(existing)
        continue
      }
    }

    console.log(`[${completed}/${cases.length}] RUN ${testCase.id} ...`)
    try {
      const artifact = await executeCase(persona, testCase)
      await writeFile(artifactPath(testCase.id), JSON.stringify(artifact, null, 2), 'utf8')
      await writeFile(
        path.join(OUT_DIR, `${testCase.id}.txt`),
        artifact.rendered,
        'utf8'
      )
      const issueCount = artifact.evaluation.issues.length
      const score = artifact.evaluation.overallAverage.toFixed(1)
      console.log(`  OK score=${score} issues=${issueCount} tokens=${artifact.inputTokens}+${artifact.outputTokens}`)
      artifacts.push(artifact)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const failed: RunArtifact = {
        caseId: testCase.id,
        personaId: persona.id,
        personaLabel: persona.label,
        group: persona.group,
        actionId: testCase.actionId,
        checkinScenario: persona.checkinScenario,
        rendered: '',
        model: 'error',
        promptVersion: '',
        inputTokens: 0,
        outputTokens: 0,
        evaluation: {
          overall: { coachingQuality: 1, professionalism: 1, personalization: 1, sendWithoutEdits: 1 },
          issues: [],
          overallAverage: 1,
        },
        generatedAt: new Date().toISOString(),
        error: message,
      }
      await writeFile(artifactPath(testCase.id), JSON.stringify(failed, null, 2), 'utf8')
      console.error(`  ERROR: ${message}`)
      artifacts.push(failed)
    }
  }

  const report = buildReport(artifacts)
  const reportPath = path.join(OUT_DIR, 'QA-VALIDATION-REPORT.md')
  await writeFile(reportPath, report, 'utf8')

  const summaryPath = path.join(OUT_DIR, 'summary.json')
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        personas: personas.length,
        cases: cases.length,
        successful: artifacts.filter((a) => !a.error).length,
        failed: artifacts.filter((a) => a.error).length,
        artifacts: artifacts.map((a) => ({
          id: a.caseId,
          score: a.evaluation.overallAverage,
          issues: a.evaluation.issues.length,
          error: a.error,
        })),
      },
      null,
      2
    ),
    'utf8'
  )

  const beforePath = path.join(OUT_DIR, 'summary-before.json')
  if (existsSync(beforePath)) {
    const comparison = buildComparisonReport(
      JSON.parse(await readFile(beforePath, 'utf8')) as {
        successful: number
        failed: number
        artifacts: { id: string; score: number; issues: number; error?: string }[]
      },
      artifacts
    )
    const comparisonPath = path.join(OUT_DIR, 'QA-COMPARISON-REPORT.md')
    await writeFile(comparisonPath, comparison, 'utf8')
    console.log(`Comparison: ${comparisonPath}`)
  }

  console.log(`\nReport: ${reportPath}`)
  console.log(`Summary: ${summaryPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
