import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()

const outDir = path.join(process.cwd(), 'scripts', 'tmp-live-theme')
fs.mkdirSync(path.join(outDir, 'templates'), { recursive: true })
fs.mkdirSync(path.join(outDir, 'sections'), { recursive: true })

for (const key of ['templates/index.json', 'sections/header-group.json']) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const v = (await r.json())?.asset?.value
  fs.writeFileSync(path.join(outDir, key), v, 'utf8')
  const parsed = JSON.parse(v)
  console.log(`\n=== ${key} (${v.length} bytes) ===`)
  console.log('order:', JSON.stringify(parsed.order))
  const hideKeys = Object.keys(parsed.sections || {}).filter((k) => /hide_1month/.test(k))
  console.log('hide_1month sections:', hideKeys)
  // custom-liquid blocks anywhere that mention hide-1month
  for (const [sid, sec] of Object.entries(parsed.sections || {})) {
    for (const [bid, blk] of Object.entries(sec.blocks || {})) {
      const cl = blk?.settings?.custom_liquid
      if (typeof cl === 'string' && /hide-1month|data-plan-index/.test(cl)) {
        console.log(`  custom_liquid block: sections.${sid}.blocks.${bid} (${cl.length} chars)`)
      }
    }
  }
}
console.log('\nsaved to scripts/tmp-live-theme/')
