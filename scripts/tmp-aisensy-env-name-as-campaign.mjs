import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

function loadEnv(path) {
  const out = {}
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const local = loadEnv('.env.local')
const apiKey = local.AISENSY_API_KEY?.trim()
if (!apiKey) {
  console.error(JSON.stringify({ error: 'No local AISENSY_API_KEY' }))
  process.exit(1)
}

// Likely mistaken: env var NAME used as campaign name value
const mistakenAsNames = [
  'AISENSY_CAMPAIGN_ONBOARDING_REMINDER',
  'AISENSY_CAMPAIGN_ACCOUNT_SETUP',
  'AISENSY_CAMPAIGN_PLAN_READY',
  'AISENSY_CAMPAIGN_MISSED_CHECKIN',
  'AISENSY_CAMPAIGN_CHECKIN_DUE',
  'AISENSY_CAMPAIGN_COACH_REPLIED',
]

const results = []
for (const campaignName of mistakenAsNames) {
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName,
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['Probe', 'Test'],
      source: 'lurvox-name-check',
    }),
  })
  const body = (await res.text()).slice(0, 200)
  results.push({
    campaignName,
    status: res.status,
    exists: !body.includes('Campaign does not exist'),
    bodyPreview: body.slice(0, 120),
  })
}

console.log(JSON.stringify({ results }, null, 2))
