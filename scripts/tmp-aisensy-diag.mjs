import fs from 'node:fs'

function loadEnvLocal() {
  const raw = fs.readFileSync('.env.local', 'utf8')
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
    out[key] = val
  }
  return out
}

const env = loadEnvLocal()
const apiKey = env.AISENSY_API_KEY?.trim()
const campaigns = Object.keys(env)
  .filter((k) => k.startsWith('AISENSY_CAMPAIGN_'))
  .reduce((acc, k) => {
    acc[k] = Boolean(env[k]?.trim())
    return acc
  }, {})

console.log(
  JSON.stringify(
    {
      hasKey: Boolean(apiKey),
      keyLen: apiKey?.length ?? 0,
      keyPrefix: apiKey ? apiKey.slice(0, 8) : null,
      campaigns,
    },
    null,
    2
  )
)

if (!apiKey) {
  console.log(JSON.stringify({ error: 'No AISENSY_API_KEY in .env.local' }))
  process.exit(1)
}

const urls = [
  'https://backend.aisensy.com/campaign/t1/api/v2',
  'https://backend.aisensy.com/campaign/t1/api/v2/',
]

for (const url of urls) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName: env.AISENSY_CAMPAIGN_CHECKIN_DUE || 'connection_test',
      destination: '919220451577',
      userName: 'LURVOX Diag',
      templateParams: ['Diag', 'Connection Test'],
      source: 'lurvox-diag',
    }),
  })
  const text = await res.text()
  console.log(
    JSON.stringify(
      {
        url,
        status: res.status,
        ok: res.ok,
        body: text.slice(0, 800),
      },
      null,
      2
    )
  )
}
