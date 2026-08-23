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

const local = loadEnv('.env.local')
const apiKey = local.AISENSY_API_KEY?.trim()
if (!apiKey) {
  console.error(JSON.stringify({ error: 'No AISENSY_API_KEY in .env.local' }))
  process.exit(1)
}

// Confirm local key still authenticates
const authProbe = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey,
    campaignName: '__probe__',
    destination: '919999999999',
    userName: 'Probe',
    templateParams: ['a'],
    source: 'lurvox-key-check',
  }),
})
const authBody = await authProbe.text()
console.log(
  JSON.stringify({
    localKeyAuthStatus: authProbe.status,
    localKeyAuthBody: authBody.slice(0, 200),
    note: '400 Campaign does not exist = key accepted; 401 = bad key',
  })
)

if (authProbe.status === 401) {
  console.error(JSON.stringify({ error: 'Local key is also unauthorized — regenerate in AiSensy' }))
  process.exit(1)
}

const rm = spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'rm', 'AISENSY_API_KEY', 'production', '--yes'],
  { encoding: 'utf8', shell: true }
)
console.log(rm.stdout?.slice(-300) || '')
console.log(rm.stderr?.slice(-300) || '')

const add = spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'add', 'AISENSY_API_KEY', 'production'],
  { encoding: 'utf8', shell: true, input: apiKey + '\n' }
)
console.log(add.stdout?.slice(-400) || '')
console.log(add.stderr?.slice(-400) || '')

const rmPreview = spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'rm', 'AISENSY_API_KEY', 'preview', '--yes'],
  { encoding: 'utf8', shell: true }
)
console.log('preview rm', rmPreview.status)
const addPreview = spawnSync(
  'npx',
  ['--yes', 'vercel', 'env', 'add', 'AISENSY_API_KEY', 'preview'],
  { encoding: 'utf8', shell: true, input: apiKey + '\n' }
)
console.log(addPreview.stdout?.slice(-300) || '')

console.log(JSON.stringify({ ok: true, next: 'redeploy production' }))
