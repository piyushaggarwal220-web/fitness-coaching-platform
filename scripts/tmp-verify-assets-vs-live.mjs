import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const themes = await fetch(`${REST}/themes.json`, { headers }).then((r) => r.json())
for (const t of themes.themes) console.log('theme', t.id, t.role, t.name, 'updated', t.updated_at)
const live = themes.themes.find((t) => t.role === 'main')

const get = async (themeId, key) => {
  const json = await fetch(`${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers,
  }).then((r) => r.json())
  return json.asset?.value ?? null
}

const idx = await get(live.id, 'templates/index.json')
const layout = await get(live.id, 'layout/theme.liquid')
const fab = await get(live.id, 'sections/mobile-floating-bar.liquid')
const block = await get(live.id, 'blocks/ai_gen_block_361650c.liquid')

console.log('\n--- asset state on live theme ---')
console.log('index has dead anchor:', idx.includes('#shopify-section-blocks_C9E4qf'))
console.log('index has 12m link:', idx.includes('plans/12-months'))
console.log('index has new label:', idx.includes('GET THE 12-MONTH PLAN'))
console.log('layout has talk highlight:', layout.includes('lurvox-talk-cta-highlight'))
console.log('fab has pulse:', fab.includes('lurvox-talk-pulse'))
console.log('fab has new label:', fab.includes('Talk To A Coach'))
console.log('block has countdown persist:', block.includes('lurvox-urgency-countdown-end-v1'))
console.log('block hero href:', (block.match(/<a href="[^"]*" class="ai-transformation-plan-cta-/) || ['none'])[0])

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`,
]
for (const url of urls) {
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 verify' } })
  const html = await res.text()
  console.log(`\n--- ${url} ---`)
  console.log('status', res.status, 'age', res.headers.get('age'), 'cache', res.headers.get('cf-cache-status') || res.headers.get('x-cache'))
  console.log('dead anchor:', html.includes('#shopify-section-blocks_C9E4qf'))
  console.log('new label:', html.includes('GET THE 12-MONTH PLAN'))
  console.log('talk highlight:', html.includes('lurvox-talk-cta-highlight'))
  console.log('fab pulse:', html.includes('lurvox-talk-pulse'))
  console.log('countdown persist:', html.includes('lurvox-urgency-countdown-end-v1'))
}
