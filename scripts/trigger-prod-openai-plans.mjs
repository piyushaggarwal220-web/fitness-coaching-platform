/**
 * Trigger production OpenAI ping + missed-plan send.
 * Auth uses SUPABASE_SERVICE_ROLE_KEY from .env.local.txt (never printed).
 *
 *   node scripts/trigger-prod-openai-plans.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ENV_PATH = path.join(ROOT, '.env.local.txt')
const BASE = 'https://app.lurvox.in'
const CHECKIN_IDS = [
  ['169f93d6-3356-4bc4-ae06-ff2f05bfa2bb', 'Ramandeep Singh Makkar'],
  ['621aa103-2e70-42f6-a613-4042ea431ed4', 'Hrithik das'],
  ['a77b78d9-42f2-4a75-85d6-514bb8184d8c', 'Rahul singla'],
  ['2bfc491a-f6b0-4e42-91f4-a1a7819c5e3c', 'Ayush Mohan'],
  ['0e8d0c42-eef4-4483-8991-44642318d1e1', 'NIKUNJBHAI PARMAR'],
]

function readEnvValue(name) {
  const text = fs.readFileSync(ENV_PATH, 'utf8')
  const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`))
  if (!line) return ''
  return line.slice(name.length + 1).replace(/^["']|["']$/g, '').trim()
}

async function main() {
  const secret = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing from .env.local.txt')
    process.exit(1)
  }
  const headers = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  }

  if (process.argv.includes('--ping')) {
    const ping = await fetch(`${BASE}/api/cron/send-missed-weekly-plans?ping=1`, { headers })
    const body = await ping.json()
    console.log(`ping_http=${ping.status} ping_ok=${body.ok === true} model=${body.model ?? ''} textLen=${body.textLen ?? 0}`)
    if (!ping.ok || body.ok === false) process.exit(1)
    return
  }

  const only = process.argv.find((arg) => arg.startsWith('--checkin='))?.slice('--checkin='.length)
  const targets = only ? CHECKIN_IDS.filter(([id]) => id === only) : CHECKIN_IDS
  for (const [checkinId, name] of targets) {
    console.log(`GENERATE ${name} ${checkinId}`)
    const res = await fetch(`${BASE}/api/cron/send-missed-weekly-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ checkinId }),
    })
    const body = await res.json()
    console.log(`${body.status ?? 'FAIL'} ${name} ${body.planId ?? ''} ${body.error ?? ''}`.trim())
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
