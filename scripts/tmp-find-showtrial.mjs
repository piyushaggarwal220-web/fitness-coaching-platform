import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const listRes = await fetch(`${API}/themes/${themeId}/assets.json?t=${Date.now()}`, { headers: H })
const all = (await listRes.json()).assets ?? []
const candidates = all
  .map((a) => a.key)
  .filter((k) => /\.(liquid|json|js)$/.test(k))

console.log('theme', themeId, '| total assets', all.length, '| scanning', candidates.length)

const hits = []
let read = 0
let failed = 0

for (const key of candidates) {
  let value = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(
      `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
      { headers: H }
    )
    if (r.status === 429) {
      await sleep(1200 * (attempt + 1))
      continue
    }
    if (!r.ok) break
    value = (await r.json())?.asset?.value
    break
  }
  if (typeof value !== 'string') {
    failed++
    continue
  }
  read++
  const needles = ['showTrialPlan', 'lurvox-hide-1month-marker', 'Only hide legacy 1-month', 'hideLegacyOneMonth']
  const found = needles.filter((n) => value.includes(n))
  if (found.length) hits.push({ key, found, bytes: value.length })
  await sleep(220)
}

console.log(`\nread ${read}, failed ${failed}`)
console.log('--- assets containing legacy toggler strings ---')
console.log(hits.length ? JSON.stringify(hits, null, 1) : '(none)')
