import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role updatedAt } } }` }),
})
const nodes = (await themeRes.json()).data.themes.nodes
const main = nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

const themeId = main.id.split('/').pop()
for (const key of ['layout/theme.liquid', 'templates/index.json', 'sections/header-group.json']) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const a = (await r.json()).asset
  const v = a.value
  console.log(`\n${key} updated=${a.updated_at} bytes=${v.length}`)
  if (key.includes('layout')) console.log('  stamps:', [...v.matchAll(/lurvox-cache-bust \d+/g)].map((m) => m[0]))
  if (key.includes('index')) {
    const j = JSON.parse(v)
    console.log('  order', j.order)
    console.log('  has hide_1month', Boolean(j.sections.lurvox_hide_1month))
    const blocks = Object.keys(j.sections.home_blocks_v2?.blocks || {}).filter((k) => k.includes('recompile'))
    console.log('  recompile blocks', blocks)
  }
  if (key.includes('header-group')) {
    const j = JSON.parse(v)
    console.log('  order', j.order)
    console.log('  has hide_1month', Boolean(j.sections.lurvox_hide_1month))
  }
}

// Compare Shopify.shop domain / permanent_domain from HTML
const html = await (await fetch('https://www.lurvox.in/?x=' + Date.now())).text()
console.log('\nShopify.shop from HTML:', html.match(/Shopify\.shop\s*=\s*"([^"]+)"/)?.[1])
console.log('theme id from HTML:', html.match(/"id":(\d+),"schema_name"/)?.[1])
console.log('theme name:', html.match(/"name":"([^"]+)","id":\d+/)?.[1])
