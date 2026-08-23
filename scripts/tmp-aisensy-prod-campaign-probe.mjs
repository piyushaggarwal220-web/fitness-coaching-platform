import fs from 'node:fs'

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

const env = loadEnv('.env.aisensy.tmp')
const apiKey = env.AISENSY_API_KEY?.trim()
const campaignKeys = [
  'AISENSY_CAMPAIGN_CHECKIN_DUE',
  'AISENSY_CAMPAIGN_PLAN_READY',
  'AISENSY_CAMPAIGN_MISSED_CHECKIN',
  'AISENSY_CAMPAIGN_ACCOUNT_SETUP',
  'AISENSY_CAMPAIGN_ONBOARDING_REMINDER',
  'AISENSY_CAMPAIGN_COACH_REPLIED',
  'AISENSY_CAMPAIGN_CHECKOUT_OTP',
]

const summary = []
for (const key of campaignKeys) {
  const campaignName = env[key]?.trim()
  if (!campaignName) {
    summary.push({ key, configured: false })
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
      templateParams: ['Probe', 'Connection'],
      source: 'lurvox-probe',
    }),
  })
  const body = (await res.text()).slice(0, 400)
  summary.push({
    key,
    configured: true,
    campaignName,
    status: res.status,
    body,
  })
}

console.log(JSON.stringify({ hasApiKey: Boolean(apiKey), summary }, null, 2))
