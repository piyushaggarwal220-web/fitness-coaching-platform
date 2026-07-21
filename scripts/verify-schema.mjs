import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const tables = ['profiles', 'purchases', 'plans', 'checkins', 'journey_entries', 'coaches', 'ai_knowledge']
console.log('=== Tables (SELECT probe) ===')
for (const t of tables) {
  const { data, error } = await sb.from(t).select('id').limit(1)
  console.log(
    `${t}:`,
    error ? `MISSING (${error.code} ${error.message})` : `OK (${data?.length ?? 0} sample rows)`
  )
}

console.log('\n=== Profile columns ===')
const cols = [
  'payment_confirmed',
  'onboarding_complete',
  'onboarding_completed_at',
  'onboarding_data',
  'coach_id',
  'plan_delivered',
  'checkin_schedule_started_at',
  'checkin_awaiting',
  'checkin_overdue',
  'gender',
  'fitness_goal',
  'training_experience',
  'activity_level',
  'diet_preference',
  'sleep_duration',
  'injuries',
  'medical_notes',
  'access_source',
  'progress_photo_front',
]
const { error: colErr } = await sb.from('profiles').select(cols.join(',')).limit(0)
console.log(colErr ? `MISSING: ${colErr.message}` : 'all present')
