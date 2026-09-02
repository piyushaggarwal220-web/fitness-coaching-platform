/**
 * Seed AI knowledge via service role (no DDL required).
 * Run: npx tsx --env-file=.env.local scripts/seed-knowledge-base.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { invalidateKnowledgeBase } from '../src/lib/ai/prompt-cache'
import type { AiKnowledgeCategory } from '../src/types/database'

const ENTRIES: { title: string; category: AiKnowledgeCategory; content: string }[] = [
  {
    title: 'Fat loss fundamentals',
    category: 'fat_loss',
    content:
      'Target a sustainable 250–400 kcal daily deficit (never more than 400 from maintenance). Protein around 1.6–2.0 g/kg is optional when it fits naturally — not a target to push toward. If allowed foods cannot hit that protein, lower protein and keep calories high (minimum 2000 kcal, or the client\'s Mifflin-St Jeor target if higher) so the client can function. Never cut calories to chase protein grams, and never write protein higher than the meals actually contain. Daily totals count only the primary meal option, never primary plus swap. Weigh 3–4 mornings per week; trend matters more than single readings. Almost nobody needs 1400–1800 kcal; if a textbook cut would go that low, still write 2000+ and flag the coach.',
  },
  {
    title: 'Muscle gain fundamentals',
    category: 'muscle_gain',
    content:
      'Target a 200–300 kcal surplus. Protein 1.6–2.0 g/kg is optional when comfortable — if it is not possible with their foods, lower protein and keep calories in surplus. Never inflate protein numbers. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery.',
  },
  {
    title: 'Recomposition guidance',
    category: 'recomposition',
    content:
      'At maintenance or slight deficit. Protein need not be maximised; if high protein is not possible, lower it and keep calories up for daily functioning. Never invent high protein numbers. Combine resistance training 3–5 days/week with moderate cardio.',
  },
  {
    title: 'Strength programming',
    category: 'strength',
    content:
      'Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). 2–3 working sets per exercise (4 only on one main compound). Never 5+ working sets. Deload every 4–8 weeks or when performance stalls with poor recovery.',
  },
  {
    title: 'Nutrition principles',
    category: 'nutrition',
    content:
      'Build meals around foods the client will actually eat. If protein is hard to hit, reduce protein and keep calories at or above 2000 kcal using carbs and fats they already eat. Never inflate meal or header protein numbers. Hydration ~2–3 L/day unless medically restricted.',
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
      'Account for menstrual cycle energy fluctuations. Keep calories at or above 2000 kcal for daily functioning. Protein can be moderate if high protein is not possible; never inflate numbers. Prefer iron-rich foods. Avoid extreme deficits.',
  },
  {
    title: 'Beginner training',
    category: 'beginner',
    content:
      'Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 working sets per exercise. Do not add extra sets for volume.',
  },
  {
    title: 'Intermediate training',
    category: 'intermediate',
    content:
      'Use structured splits (PPL, upper/lower). 3 working sets per exercise is enough; 4 only on one main compound. Do not stack 5+ sets. Track loads.',
  },
  {
    title: 'Advanced training',
    category: 'advanced',
    content:
      'Individualise volume landmarks and mesocycles. Still cap working sets: 3 per exercise, 4 on one main compound only. Autoregulate load via RPE/RIR.',
  },
]

async function main(): Promise<void> {
  const admin = createAdminClient()
  let created = 0
  let updated = 0

  for (const entry of ENTRIES) {
    const { data: existing } = await admin
      .from('ai_knowledge')
      .select('id, content, version')
      .eq('category', entry.category)
      .eq('title', entry.title)
      .eq('active', true)
      .limit(1)

    if (existing && existing.length > 0) {
      const row = existing[0]!
      if (row.content === entry.content) continue
      const { error } = await admin
        .from('ai_knowledge')
        .update({ content: entry.content, version: (row.version ?? 1) + 1 })
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
  if (created > 0 || updated > 0) {
    await invalidateKnowledgeBase()
    console.log('Invalidated knowledge-base prompt cache.')
  }
  process.exit(0)
}

void main()
