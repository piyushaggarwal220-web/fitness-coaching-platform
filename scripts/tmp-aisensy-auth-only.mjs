import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const m = raw.match(/^AISENSY_API_KEY=(.*)$/m)
const apiKey = (m?.[1] || '').trim().replace(/^"|"$/g, '')

const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey,
    campaignName: '__lurvox_probe__',
    destination: '919999999999',
    userName: 'Probe',
    templateParams: ['Probe', 'Test'],
    source: 'lurvox-auth',
  }),
})
const body = (await res.text()).slice(0, 300)
console.log(
  JSON.stringify({
    apiKeyLen: apiKey.length,
    status: res.status,
    body,
    authOk: res.status !== 401 && !body.toLowerCase().includes('unauthorized'),
  })
)
