/**
 * Seed AI knowledge via service role (no DDL required).
 * Run: npx tsx --env-file=.env.local scripts/seed-knowledge-base.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import type { AiKnowledgeCategory } from '../src/types/database'

const ENTRIES: { title: string; category: AiKnowledgeCategory; content: string }[] = [
  {
    title: 'Fat loss fundamentals',
    category: 'fat_loss',
    content:
      'Target a sustainable 300–500 kcal daily deficit. Protein around 1.6–2.0 g/kg is optional when it fits naturally — not a target to push toward. Do not maximise protein just because the client could add more; comfortable adherence beats high grams. Lower protein (including ~0.5 g/kg in special cases) can be fine. Never falsify protein totals. Keep fibre/volume high for satiety when helpful. Weigh 3–4 mornings per week; trend matters more than single readings. Never drop below ~1600 kcal without medical oversight.',
  },
  {
    title: 'Muscle gain fundamentals',
    category: 'muscle_gain',
    content:
      'Target a 200–300 kcal surplus. Protein 1.6–2.0 g/kg is optional when comfortable — do not push protein just because food options exist. Lower protein can work; never falsify macros. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery.',
  },
  {
    title: 'Recomposition guidance',
    category: 'recomposition',
    content:
      'At maintenance or slight deficit. Protein need not be maximised; moderate or even low protein (~0.5 g/kg in special cases) is acceptable when it fits the client. Never invent high protein numbers. Combine resistance training 3–5 days/week with moderate cardio.',
  },
  {
    title: 'Strength programming',
    category: 'strength',
    content:
      'Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). Deload every 4–8 weeks or when performance stalls with poor recovery.',
  },
  {
    title: 'Nutrition principles',
    category: 'nutrition',
    content:
      'Build meals around foods the client will actually eat — vegetables, carbs they enjoy, and a comfortable amount of protein. Do not push protein higher just because they have options to increase it. Lower protein plans are fine when honest and sustainable; never inflate meal or header protein numbers. Hydration ~2–3 L/day unless medically restricted.',
  },
  {
    title: 'Cardio guidelines',
    category: 'cardio',
    content:
      'LISS 20–40 min post-workout or on rest days for fat loss. Limit HIIT to 1–2 sessions/week if recovery is poor.',
  },
  {
    title: 'Supplement guidance',
    category: 'supplements',
    content:
      'Evidence-supported basics: creatine monohydrate 3–5 g/day, vitamin D if deficient, whey if protein gap exists.',
  },
  {
    title: 'Recovery principles',
    category: 'recovery',
    content:
      'Sleep is the primary recovery tool. Manage training volume when sleep <6 h or stress is high.',
  },
  {
    title: 'Weekly check-in interpretation',
    category: 'checkins',
    content:
      'Use weight trend, waist, hunger, energy, training performance, and adherence together. Hunger 8+/10 → try fibre, food volume, meal timing, or a small calorie adjustment first — do not default to pushing protein higher.',
  },
  {
    title: 'Injury modifications',
    category: 'injuries',
    content:
      'Never train through sharp pain. Substitute aggravating movements. Recommend medical clearance for acute symptoms.',
  },
  {
    title: 'Female-specific considerations',
    category: 'female',
    content:
      'Account for menstrual cycle energy fluctuations; maintain protein and iron-rich foods. Avoid extreme deficits.',
  },
  {
    title: 'Beginner training',
    category: 'beginner',
    content:
      'Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 sets per exercise.',
  },
  {
    title: 'Intermediate training',
    category: 'intermediate',
    content:
      'Use structured splits (PPL, upper/lower). Periodise volume and intensity. Track loads.',
  },
  {
    title: 'Advanced training',
    category: 'advanced',
    content:
      'Individualise volume landmarks and mesocycles. Autoregulate load via RPE/RIR.',
  },
]

async function main(): Promise<void> {
  const admin = createAdminClient()
  let created = 0
  let updated = 0

  for (const entry of ENTRIES) {
    const { data: existing } = await admin
      .from('ai_knowledge')
      .select('id, content')
      .eq('category', entry.category)
      .eq('title', entry.title)
      .eq('active', true)
      .limit(1)

    if (existing && existing.length > 0) {
      const row = existing[0]!
      if (row.content === entry.content) continue
      const { error } = await admin
        .from('ai_knowledge')
        .update({ content: entry.content })
        .eq('id', row.id)
      if (error) {
        console.error(`FAIL update ${entry.category}: ${error.message}`)
        process.exit(1)
      }
      updated++
      console.log(`UPDATED ${entry.category}: ${entry.title}`)
      continue
    }

    const { error } = await admin.from('ai_knowledge').insert({
      title: entry.title,
      category: entry.category,
      content: entry.content,
      version: 1,
      active: true,
    })

    if (error) {
      console.error(`FAIL ${entry.category}: ${error.message}`)
      process.exit(1)
    }
    created++
    console.log(`CREATED ${entry.category}: ${entry.title}`)
  }

  console.log(`\nDone. created=${created}, updated=${updated}`)
  process.exit(0)
}

void main()
