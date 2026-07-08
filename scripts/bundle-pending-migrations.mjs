import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  'supabase/migrations/20260708100000_add_home_workout_prompt_categories.sql',
  'supabase/migrations/20260708110000_seed_ai_knowledge.sql',
  'supabase/migrations/20260708200000_complexity_score_system.sql',
]

const parts = FILES.map((file) => {
  const sql = readFileSync(file, 'utf8').trim()
  return `-- ${file}\n${sql}`
})

const out = `${parts.join('\n\n')}\n`
writeFileSync('scripts/production-pending-migrations.sql', out)
console.log(`Wrote scripts/production-pending-migrations.sql (${FILES.length} migrations)`)
