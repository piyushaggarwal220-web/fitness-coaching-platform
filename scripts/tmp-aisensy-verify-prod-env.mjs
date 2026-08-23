const keys = [
  'AISENSY_CAMPAIGN_CHECKIN_DUE',
  'AISENSY_CAMPAIGN_PLAN_READY',
  'AISENSY_CAMPAIGN_MISSED_CHECKIN',
  'AISENSY_CAMPAIGN_ACCOUNT_SETUP',
  'AISENSY_CAMPAIGN_ONBOARDING_REMINDER',
  'AISENSY_CAMPAIGN_COACH_REPLIED',
]

const apiKey = process.env.AISENSY_API_KEY?.trim() || ''
const summary = {
  apiKeyLen: apiKey.length,
  apiKeyLooksJwt: apiKey.startsWith('eyJ'),
  campaigns: {},
  probes: [],
}

for (const key of keys) {
  const name = process.env[key]?.trim() || ''
  summary.campaigns[key] = {
    set: Boolean(name),
    len: name.length,
    // show only a safe fingerprint, not the full secret/name if long
    looksLikeEnvKeyName: name === key,
    preview: name ? `${name.slice(0, 3)}…${name.slice(-3)}` : null,
  }
}

if (!apiKey) {
  console.log(JSON.stringify({ ...summary, error: 'AISENSY_API_KEY missing in env run' }, null, 2))
  process.exit(1)
}

for (const key of keys) {
  const campaignName = process.env[key]?.trim()
  if (!campaignName) {
    summary.probes.push({ key, outcome: 'unset' })
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
      source: 'lurvox-verify-after-user-update',
    }),
  })
  const body = (await res.text()).slice(0, 220)
  const lower = body.toLowerCase()
  let outcome = 'other'
  if (res.status === 401 || lower.includes('unauthorized')) outcome = 'unauthorized'
  else if (lower.includes('campaign does not exist')) outcome = 'campaign_missing'
  else if (res.ok) outcome = 'accepted'
  else if (lower.includes('invalid') || lower.includes('destination') || lower.includes('param'))
    outcome = 'campaign_exists_request_issue'
  summary.probes.push({
    key,
    status: res.status,
    outcome,
    bodyPreview: outcome === 'other' || outcome === 'campaign_exists_request_issue' ? body : undefined,
  })
}

console.log(JSON.stringify(summary, null, 2))
