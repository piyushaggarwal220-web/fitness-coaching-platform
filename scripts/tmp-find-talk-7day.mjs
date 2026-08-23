import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const assets = await (await fetch(`${API}/themes/${main.id}/assets.json`, { headers })).json()
const keys = (assets.assets || [])
  .map((a) => a.key)
  .filter((k) => /talk|consult|coach/i.test(k))
console.log('keys', keys)

async function get(key) {
  const r = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}

for (const key of keys) {
  const value = await get(key)
  if (!value) continue
  const hits = [...value.matchAll(/7.?day|trial|1_week|179|plan_1/gi)].map((m) => m[0])
  if (hits.length) console.log(key, 'hits', [...new Set(hits)])
}

const html = await (
  await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126' },
  })
).text()

console.log({
  themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
  has7Day: /7.?day/i.test(html),
  hasTrial: /trial/i.test(html),
  planLabels: [...html.matchAll(/<(?:option|label|button|div)[^>]*>[^<]*(7.?day|3.?month|6.?month|12.?month|1.?year)[^<]*</gi)].map(
    (m) => m[0].replace(/<[^>]+>/g, '').trim()
  ).slice(0, 20),
})
