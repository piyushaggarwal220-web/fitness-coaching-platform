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

spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'pull', '.env.aisensy.tmp', '--environment', 'production', '--yes'],
  { encoding: 'utf8', shell: true, stdio: 'pipe' }
)

const prod = loadEnv('.env.aisensy.tmp')
const local = loadEnv('.env.local')
const prodKey = prod.AISENSY_API_KEY?.trim() || ''
const localKey = local.AISENSY_API_KEY?.trim() || ''

async function probe(apiKey, label) {
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName: '__probe__',
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['a'],
      source: 'lurvox-compare',
    }),
  })
  return { label, status: res.status, body: (await res.text()).slice(0, 160), keyLen: apiKey.length }
}

const a = await probe(localKey, 'local')
const b = await probe(prodKey, 'prod-pulled')

// Also try first production campaign with LOCAL key
const campaign = prod.AISENSY_CAMPAIGN_CHECKIN_DUE?.trim()
let localKeyWithProdCampaign = null
if (campaign) {
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: localKey,
      campaignName: campaign,
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['Probe', 'Test'],
      source: 'lurvox-compare',
    }),
  })
  localKeyWithProdCampaign = {
    status: res.status,
    body: (await res.text()).slice(0, 200),
    campaignLen: campaign.length,
  }
}

fs.unlinkSync('.env.aisensy.tmp')

console.log(
  JSON.stringify(
    {
      keysMatch: prodKey === localKey,
      localPrefix: localKey.slice(0, 8),
      prodPrefix: prodKey.slice(0, 8),
      a,
      b,
      localKeyWithProdCampaign,
    },
    null,
    2
  )
)
