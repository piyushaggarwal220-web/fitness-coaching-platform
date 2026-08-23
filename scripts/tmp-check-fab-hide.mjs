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
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()
console.log('MAIN', main.name, themeId)

const key = 'sections/mobile-floating-bar.liquid'
const r = await fetch(
  `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: H }
)
const v = (await r.json()).asset?.value || ''
console.log('bytes', v.length)
console.log('has hide-1month fab marker:', /lurvox-hide-1month-fab/.test(v))
console.log('hides data-plan-index="1":', /data-plan-index=.1./.test(v) || /data-plan-index=\"1\"/.test(v))
console.log('has showTrialPlan:', v.includes('showTrialPlan'))

const out = path.join(process.cwd(), 'scripts', 'tmp-live-theme', 'sections', 'mobile-floating-bar.liquid')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, v)
console.log('saved', out)

// Also probe fresh vs stale for actual trial card visibility in rendered cards
for (const u of [`https://www.lurvox.in/?view=&t=${Date.now()}`, `https://www.lurvox.in/?t=${Date.now()}`]) {
  const html = await (await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text()
  const cards = [...html.matchAll(/data-plan-index="(\d)"[^>]*data-plan-price="([^"]+)"[^>]*data-plan-duration="([^"]+)"/g)]
    .map((m) => ({ index: m[1], price: m[2], duration: m[3] }))
  console.log('\n', u.slice(0, 40))
  console.log('  cards:', cards)
  console.log('  fab hide script:', /lurvox-hide-1month-fab|data-plan-index=.1.[\s\S]{0,80}display:\s*none/.test(html))
  console.log('  showTrialPlan:', html.includes('showTrialPlan'))
}
