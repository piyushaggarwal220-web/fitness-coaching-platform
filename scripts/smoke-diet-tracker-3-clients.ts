/**
 * Parse 3 live client diets the tracker was dropping or lumping into one meal.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-diet-tracker-3-clients.ts
 */
import { buildTrackerSnapshot } from '../src/lib/daily-tracker/parser'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { Plan } from '../src/types/database'

const CLIENTS = [
  { id: '218f9a7d-de26-4987-9c3c-bed709714ac0', expect: 'time-first meals, not empty' },
  { id: '113560a8-435e-4853-b1cd-bb9a0acb8a31', expect: 'MEAL N split, not one Meals blob' },
  { id: '11d6e415-16e6-4738-97b6-11a97b4c9407', expect: 'Breakfast — time + Before Sleep' },
] as const

let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    failed += 1
  } else {
    console.log(`PASS ${label}`)
  }
}

async function main() {
  const supabase = createAdminClient()

  const { data: plans, error } = await supabase
    .from('plans')
    .select('*')
    .eq('active', true)
    .in(
      'client_id',
      CLIENTS.map((c) => c.id)
    )

  if (error) throw new Error(error.message)

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name')
    .in(
      'id',
      CLIENTS.map((c) => c.id)
    )

  if (profileError) throw new Error(profileError.message)

  for (const client of CLIENTS) {
    const plan = (plans ?? []).find((row) => row.client_id === client.id) as Plan | undefined
    const name = profiles?.find((p) => p.id === client.id)?.name ?? client.id
    if (!plan) {
      assert(`${name} has an active plan`, false)
      continue
    }

    const snap = buildTrackerSnapshot(plan)
    const meals = snap.items.filter((item) => item.type === 'meal')
    const days = snap.dietDays ?? []
    const titles = meals.map((item) => (item.type === 'meal' ? item.title : ''))
    const uniqueTitles = [...new Set(titles)]
    const lumped = meals.filter((item) => item.type === 'meal' && item.title === 'Meals')
    const byDay = new Map<string, string[]>()
    for (const meal of meals) {
      if (meal.type !== 'meal') continue
      const key = meal.dietDay ?? 'today'
      byDay.set(key, [...(byDay.get(key) ?? []), meal.title])
    }

    console.log(`\n${name}`)
    console.log(`  expect: ${client.expect}`)
    console.log(`  nutrition chars: ${plan.nutrition_plan?.length ?? 0}`)
    console.log(`  diet days: ${days.length} · meals: ${meals.length}`)
    console.log(`  titles: ${uniqueTitles.join(', ') || '(none)'}`)
    for (const [day, dayTitles] of byDay) {
      console.log(`  ${day}: ${dayTitles.length} → ${dayTitles.join(', ')}`)
    }

    assert(`${name} has meals in the tracker`, meals.length > 0, String(meals.length))
    assert(
      `${name} is not one all-day Meals blob`,
      meals.length >= 3 && lumped.length === 0,
      `meals=${meals.length} lumped=${lumped.length}`
    )
    assert(
      `${name} has breakfast and at least one other meal type`,
      uniqueTitles.some((title) => /breakfast/i.test(title)) && uniqueTitles.length >= 3,
      uniqueTitles.join(', ')
    )
  }

  if (failed > 0) {
    console.error(`\n${failed} diet tracker smoke checks failed`)
    process.exit(1)
  }

  console.log('\nAll 3 client diet tracker smoke checks passed')
}

void main()
