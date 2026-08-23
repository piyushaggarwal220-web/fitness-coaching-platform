import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
const key = 'templates/index.json'
const res = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers }
)
const val = JSON.parse(await res.text()).asset.value
const j = JSON.parse(val)
let found = null
for (const sec of Object.values(j.sections || {})) {
  for (const [, b] of Object.entries(sec.blocks || {})) {
    if (b?.settings?.plan_2_price || b?.settings?.plan_3_price) {
      found = b.settings
      break
    }
  }
  if (found) break
}
console.log({
  plan_2_price: found?.plan_2_price,
  plan_3_price: found?.plan_3_price,
  plan_4_price: found?.plan_4_price,
  plan_2_monthly: found?.plan_2_monthly,
  plan_3_monthly: found?.plan_3_monthly,
  plan_4_monthly: found?.plan_4_monthly,
  plan_2_original: found?.plan_2_original_price,
  plan_3_original: found?.plan_3_original_price,
  plan_4_original: found?.plan_4_original_price,
})

const html = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
).text()
const re = /(?:₹\s*[\d,]+|Rs\.?\s*[\d,]+|566\/mo|333\/mo|2699|3699)/g
const hits = [...html.matchAll(re)].map((m) => m[0])
console.log('uniqueHits', [...new Set(hits)].slice(0, 50))
console.log('hasOld2699', /2,?699/.test(html))
console.log('hasOld3699', /3,?699/.test(html))
console.log('has566', /566/.test(html))
