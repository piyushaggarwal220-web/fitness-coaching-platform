import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

function loadEnv(path) {
  const raw = fs.readFileSync(path, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) {
      try {
        val = JSON.parse(val)
      } catch {
        val = val.slice(1, -1)
      }
    }
    out[key] = val
  }
  return out
}

const pull = spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'pull', '.env.aisensy.tmp', '--environment', 'production', '--yes'],
  { encoding: 'utf8', shell: true }
)
if (pull.status !== 0) {
  console.error(pull.stderr || pull.stdout)
  process.exit(1)
}

const env = loadEnv('.env.aisensy.tmp')
const apiKey = env.AISENSY_API_KEY?.trim()
const keys = [
  'AISENSY_CAMPAIGN_CHECKIN_DUE',
  'AISENSY_CAMPAIGN_PLAN_READY',
  'AISENSY_CAMPAIGN_MISSED_CHECKIN',
  'AISENSY_CAMPAIGN_ACCOUNT_SETUP',
  'AISENSY_CAMPAIGN_ONBOARDING_REMINDER',
]

const results = []
for (const key of keys) {
  const campaignName = env[key]?.trim()
  if (!campaignName) {
    results.push({ key, configured: false })
    continue
  }
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName,
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['Probe', 'Test'],
      source: 'lurvox-verify',
    }),
  })
  const body = (await res.text()).slice(0, 300)
  results.push({
    key,
    configured: true,
    status: res.status,
    // classify without dumping sensitive campaign names
    outcome:
      res.status === 401
        ? 'unauthorized'
        : body.includes('Campaign does not exist')
          ? 'campaign_missing'
          : res.status === 200 || res.ok
            ? 'accepted'
            : body.includes('Invalid') || body.includes('destination')
              ? 'likely_ok_bad_destination'
              : `other:${body.slice(0, 120)}`,
  })
}

fs.unlinkSync('.env.aisensy.tmp')
console.log(JSON.stringify({ results }, null, 2))
