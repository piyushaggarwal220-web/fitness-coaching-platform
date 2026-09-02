/**
 * Gold-diff: written workout_plan lift lines vs what the daily tracker shows.
 *
 *   npx tsx --env-file=.env.local.txt scripts/audit-tracker-workout-gold.ts
 *   npx tsx --env-file=.env.local.txt scripts/audit-tracker-workout-gold.ts --limit=80
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAdminClient } from '../src/lib/supabase/admin'
import {
  buildTrackerSnapshot,
  isCoachingExerciseName,
} from '../src/lib/daily-tracker/parser'
import { ensureWarmupPhase } from '../src/lib/daily-tracker/display'
import type { Plan } from '../src/types/database'
import type { TrackerExerciseItem, TrackerWorkoutItem } from '../src/lib/daily-tracker/types'

type GoldLift = { name: string; line: string }
type DayIssue = {
  day: string
  missing: string[]
  extra: string[]
  coaching: string[]
  walkingSets: string[]
}

type PlanAudit = {
  planId: string
  clientId: string
  email: string | null
  name: string | null
  trial: boolean
  workoutChars: number
  writtenDays: number
  trackerDays: number
  duplicateWrittenKeys: string[]
  issues: DayIssue[]
  fail: boolean
  notes: string[]
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const STOP = new Set(['the', 'and', 'with', 'for', 'your', 'each', 'side', 'to'])

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function stripDecorators(value: string): string {
  return value.replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^#{1,3}\s*/, '').trim()
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|and|with|for|your|each|side|to|sets?|reps?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function coreName(name: string): string {
  return normalizeName(
    name
      .replace(/\([^)]*\)/g, ' ')
      .split(/\bor\b/i)[0] ?? name
  )
}

function namesMatch(a: string, b: string): boolean {
  const na = coreName(a)
  const nb = coreName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) >= 5
  }
  const wa = na.split(' ').filter((w) => w.length > 2 && !STOP.has(w))
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2 && !STOP.has(w)))
  const overlap = wa.filter((w) => wb.has(w))
  return overlap.length >= 2 || (overlap.length === 1 && overlap[0]!.length >= 7)
}

function resolveDayKey(firstLine: string): { key: string; label: string } | null {
  const first = stripDecorators(firstLine)
  const dayMatch = first.match(
    /^(?:(day\s*\d+)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b(?:\s*[(\[–—:-]+\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?/i
  )
  if (!dayMatch) return null
  const token = (dayMatch[1] || dayMatch[2] || '').toLowerCase().replace(/\s+/g, ' ')
  const hint = dayMatch[3]?.toLowerCase()
  if (hint && WEEKDAYS.includes(hint)) return { key: hint, label: first }
  if (WEEKDAYS.includes(token)) return { key: token, label: first }
  const n = Number(token.replace(/day\s*/, ''))
  if (n >= 1 && n <= 7) return { key: WEEKDAYS[n - 1] ?? `day-${n}`, label: first }
  return { key: token.replace(/\s+/g, '-'), label: first }
}

function splitWrittenDays(workout: string): Array<{ key: string; label: string; body: string }> {
  const blocks = workout.replace(/\r\n/g, '\n').split(
    /\n(?=(?:\*{0,2}|#{1,3}\s*)?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i
  )
  const byKey = new Map<string, { key: string; label: string; body: string }>()
  for (const block of blocks) {
    const lines = block.split('\n')
    const meta = resolveDayKey(lines[0]?.trim() ?? '')
    if (!meta) continue
    const row = { key: meta.key, label: meta.label, body: block.trim() }
    const existing = byKey.get(meta.key)
    if (!existing || row.body.length > existing.body.length) byKey.set(meta.key, row)
  }
  return [...byKey.values()]
}

function extractGoldLifts(body: string): GoldLift[] {
  const mainStart = body.search(/\n\s*(?:main(?:\s+workout)?|working\s+sets?)\s*:/i)
  const scoped =
    mainStart >= 0
      ? (() => {
          const fromMain = body.slice(mainStart + 1)
          const end = fromMain.search(
            /\n\s*(?:post\s*workout|cool[- ]?down|stretching|recovery)\s*:/i
          )
          return end >= 0 ? fromMain.slice(0, end) : fromMain
        })()
      : body
  const lifts: GoldLift[] = []
  const repsToken = String.raw`(\d+(?:\s*(?:-|–|to)\s*\d+)?|AMRAP|\d+\s*s)`
  const patterns = [
    new RegExp(
      String.raw`^(.+?)\s*[:–—]?\s*(\d+)\s*sets?\s*[x×]\s*${repsToken}(?:\s*reps?)?`,
      'i'
    ),
    new RegExp(String.raw`^(.+?)\s*[:–—]?\s*(\d+)\s*sets?\s+of\s+${repsToken}(?:\s*reps?)?`, 'i'),
    new RegExp(String.raw`^(.+?)\s+(\d+)\s*[x×]\s*${repsToken}`, 'i'),
    new RegExp(
      String.raw`^(.+?)\s*[:–—]?\s*(\d+)\s*sets?\s*[x×]\s*(\d+)\s*(min|mins|minutes|sec|secs|seconds|s)\b`,
      'i'
    ),
  ]
  const walk = /^(.{2,50}?)\s*[:–—]?\s*(\d+)\s*(?:-\s*\d+\s*)?(min|mins|minutes)\b/i
  const restDay = /\b(rest\s*day|full\s*rest|off\s*day)\b/i.test(body)

  for (const raw of scoped.split('\n')) {
    const line = stripDecorators(raw.replace(/^[-*•]\s*/, '').trim())
    if (!line) continue
    if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(line)) {
      continue
    }
    if (/\b(warm-?up|cool-?down|post-workout|pre-workout|mobility)\b/i.test(line) && line.length < 40) {
      continue
    }
    if (restDay) continue
    if (/\b(stretch|child'?s pose|arm circles|leg swings|wrist circles|hip circles|cat.?cow)\b/i.test(line)) {
      continue
    }
    let name: string | null = null
    for (const re of patterns) {
      const m = line.match(re)
      if (m?.[1]) {
        name = m[1].replace(/:$/, '').replace(/^(?:core|finisher|accessory)\s*:\s*/i, '').trim()
        break
      }
    }
    if (!name) {
      const m = line.match(walk)
      if (m && /\b(walk|jog|bike|cycle|row)\b/i.test(m[1]!)) name = m[1]!.trim()
    }
    if (!name || name.length < 3 || name.length > 60) continue
    if (isCoachingExerciseName(name)) continue
    if (/^(lower|upper|push|pull|legs?|chest|back|shoulders?|arms?)\b/i.test(name) && name.split(' ').length <= 3) {
      continue
    }
    lifts.push({ name, line })
  }
  return lifts
}

function comparableExercises(workout: TrackerWorkoutItem): TrackerExerciseItem[] {
  const shown = ensureWarmupPhase(workout)
  return shown.exercises.filter(
    (ex) => (ex.phase === 'main' || ex.phase === 'finisher') && !/warmup-default/.test(ex.id)
  )
}

function allShownExercises(workout: TrackerWorkoutItem): TrackerExerciseItem[] {
  return ensureWarmupPhase(workout).exercises
}

function unmatched(from: string[], haystack: string[]): string[] {
  const used = new Set<number>()
  const missing: string[] = []
  for (const name of from) {
    const idx = haystack.findIndex((h, i) => !used.has(i) && namesMatch(name, h))
    if (idx < 0) missing.push(name)
    else used.add(idx)
  }
  return missing
}

function asPlan(row: { id: string; client_id: string; workout_plan: string; nutrition_plan: string | null; version: number | null; title: string | null; updated_at: string | null }): Plan {
  const now = row.updated_at ?? new Date().toISOString()
  return {
    id: row.id,
    client_id: row.client_id,
    coach_id: '',
    title: row.title ?? 'Plan',
    phase: 'Phase 1',
    nutrition_plan: row.nutrition_plan ?? '',
    workout_plan: row.workout_plan,
    cardio_plan: '',
    supplement_plan: '',
    coach_notes: '',
    version: row.version ?? 1,
    active: true,
    delivered_at: now,
    updated_at: now,
    created_at: now,
  }
}

function auditWorkout(workout: string, snapWorkouts: TrackerWorkoutItem[], pickerDays: number): Omit<PlanAudit, 'planId' | 'clientId' | 'email' | 'name' | 'trial'> {
  const written = splitWrittenDays(workout)
  const keyCounts = new Map<string, number>()
  for (const d of written) keyCounts.set(d.key, (keyCounts.get(d.key) ?? 0) + 1)
  const duplicateWrittenKeys = [...keyCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k)

  const byKey = new Map<string, TrackerWorkoutItem>()
  for (const w of snapWorkouts) {
    if (w.workoutDay) byKey.set(w.workoutDay, w)
  }

  const issues: DayIssue[] = []
  const notes: string[] = []

  const restLike = (body: string, label: string) =>
    /\b(rest\s*day|full\s*rest|off\s*day|recovery\s*day)\b/i.test(`${label}\n${body}`)

  for (const day of written) {
    const gold = extractGoldLifts(day.body)
    const session = byKey.get(day.key)
    if (restLike(day.body, day.label)) {
      if (session) {
        const extra = comparableExercises(session)
          .map((e) => e.name)
          .filter((name) => {
            const core = coreName(name)
            if (!core || core.length < 4) return false
            if (/\b(walk|jog|cycle|bike|stretch|yoga|twist|mobility|pose)\b/i.test(name)) return false
            return !normalizeName(day.body).includes(core)
          })
        if (extra.length) {
          issues.push({
            day: day.key,
            missing: [],
            extra,
            coaching: [],
            walkingSets: [],
          })
        }
      }
      continue
    }
    if (gold.length === 0) continue
    if (!session) {
      issues.push({
        day: day.key,
        missing: gold.map((g) => g.name),
        extra: [],
        coaching: [],
        walkingSets: [],
      })
      continue
    }
    const shown = comparableExercises(session)
    const shownNames = shown.map((e) => e.name)
    const goldNames = gold.map((g) => g.name)
    const missing = unmatched(goldNames, shownNames).filter((name) => {
      const core = coreName(name)
      return !shownNames.some((shown) => namesMatch(name, shown) || coreName(shown).includes(core))
    })
    const extra = unmatched(shownNames, goldNames).filter((name) => {
      const core = coreName(name)
      if (!core || core.length < 4) return false
      return !normalizeName(day.body).includes(core)
    })
    const coaching = allShownExercises(session)
      .filter((e) => isCoachingExerciseName(e.name))
      .map((e) => e.name)
    const walkingSets = allShownExercises(session)
      .filter((e) => /\bwalk(?:ing)?\b/i.test(e.name) && !/\blunge/i.test(e.name) && e.targetSets > 1)
      .map((e) => `${e.name} sets=${e.targetSets}`)
    if (missing.length || extra.length || coaching.length || walkingSets.length) {
      issues.push({ day: day.key, missing, extra, coaching, walkingSets })
    }
  }

  if (duplicateWrittenKeys.length) {
    notes.push(`written day keys duplicated: ${duplicateWrittenKeys.join(', ')}`)
  }
  if (pickerDays > 8) notes.push(`tracker picker has ${pickerDays} days`)

  const fail =
    issues.some((i) => i.missing.length > 0 || i.extra.length > 0 || i.coaching.length > 0 || i.walkingSets.length > 0) ||
    pickerDays > 10

  return {
    workoutChars: workout.length,
    writtenDays: new Set(written.map((d) => d.key)).size,
    trackerDays: pickerDays,
    duplicateWrittenKeys,
    issues,
    fail,
    notes,
  }
}

async function main() {
  const limit = Math.max(10, Number(argValue('limit', '120')) || 120)
  const admin = createAdminClient()
  const { data: plans, error } = await admin
    .from('plans')
    .select('id, client_id, workout_plan, nutrition_plan, version, title, updated_at, active')
    .eq('active', true)
    .not('workout_plan', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const clientIds = [...new Set((plans ?? []).map((p) => p.client_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, email')
    .in('id', clientIds)
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const results: PlanAudit[] = []
  for (const row of plans ?? []) {
    const workout = String(row.workout_plan ?? '').trim()
    if (workout.length < 120) continue
    const profile = profileById.get(row.client_id)
    const email = profile?.email ?? null
    const trial = /@trial\.test\.local$/i.test(email ?? '')
    const snap = buildTrackerSnapshot(asPlan(row), undefined)
    const workouts = snap.items.filter((i): i is TrackerWorkoutItem => i.type === 'workout')
    const audited = auditWorkout(workout, workouts, snap.workoutDays?.length ?? 0)
    results.push({
      planId: row.id,
      clientId: row.client_id,
      email,
      name: profile?.name ?? null,
      trial,
      ...audited,
    })
  }

  const live = results.filter((r) => !r.trial)
  const failing = live.filter((r) => r.fail)
  const reportPath = join(process.cwd(), 'tmp-tracker-workout-gold.json')
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        scanned: results.length,
        live: live.length,
        liveFailing: failing.length,
        livePassPercent: Math.round(((live.length - failing.length) / Math.max(1, live.length)) * 100),
        results: live,
      },
      null,
      2
    )
  )

  console.log(`Scanned ${results.length} workouts (${live.length} live, ${results.length - live.length} trial)`)
  console.log(`Live tracker gold-diff: ${live.length - failing.length}/${live.length} clean (${Math.round(((live.length - failing.length) / Math.max(1, live.length)) * 100)}%)`)
  console.log(`Report: ${reportPath}`)

  const miss = failing.reduce((n, r) => n + r.issues.reduce((m, i) => m + i.missing.length, 0), 0)
  const extra = failing.reduce((n, r) => n + r.issues.reduce((m, i) => m + i.extra.length, 0), 0)
  const coaching = failing.reduce((n, r) => n + r.issues.reduce((m, i) => m + i.coaching.length, 0), 0)
  console.log(`Live issue counts: missing=${miss} extra=${extra} coachingNames=${coaching}`)

  for (const r of failing.slice(0, 15)) {
    console.log(`\nFAIL ${r.name ?? r.email ?? r.clientId}`)
    if (r.notes.length) console.log(`  notes: ${r.notes.join('; ')}`)
    for (const issue of r.issues.slice(0, 4)) {
      if (issue.missing.length) console.log(`  ${issue.day} missing: ${issue.missing.slice(0, 6).join(' | ')}`)
      if (issue.extra.length) console.log(`  ${issue.day} extra: ${issue.extra.slice(0, 6).join(' | ')}`)
      if (issue.coaching.length) console.log(`  ${issue.day} coaching: ${issue.coaching.slice(0, 4).join(' | ')}`)
      if (issue.walkingSets.length) console.log(`  ${issue.day} walking: ${issue.walkingSets.join(' | ')}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
