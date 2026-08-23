import fs from 'node:fs'

function loadEnv(path) {
  const raw = fs.readFileSync(path, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
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
    // vercel env pull wraps in quotes sometimes with escaped content
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

const env = loadEnv('.env.local')
const apiKey = env.AISENSY_API_KEY?.trim()
if (!apiKey) {
  console.log(JSON.stringify({ error: 'missing key' }))
  process.exit(1)
}

let jwtInfo = null
if (apiKey.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(apiKey.split('.')[1], 'base64url').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    jwtInfo = {
      hasExp: typeof payload.exp === 'number',
      exp: payload.exp ?? null,
      expired: typeof payload.exp === 'number' ? payload.exp < now : null,
      secondsToExp:
        typeof payload.exp === 'number' ? payload.exp - now : null,
      iat: payload.iat ?? null,
      keys: Object.keys(payload),
    }
  } catch (e) {
    jwtInfo = { parseError: e instanceof Error ? e.message : 'parse failed' }
  }
}

// Auth-only probe: empty campaign should still prove token acceptance
const probes = [
  { label: 'missing-campaign', campaignName: '' },
  { label: 'nonsense-campaign', campaignName: '__lurvox_connection_probe__' },
]

const results = []
for (const p of probes) {
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName: p.campaignName,
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['a'],
      source: 'lurvox-probe',
    }),
  })
  results.push({
    label: p.label,
    status: res.status,
    body: (await res.text()).slice(0, 250),
  })
}

console.log(JSON.stringify({ jwtInfo, results }, null, 2))
