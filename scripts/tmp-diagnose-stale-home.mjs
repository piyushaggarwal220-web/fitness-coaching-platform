import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const THEME = '161086767355'

const raw = await fetch(`${REST}/themes/${THEME}/assets.json?asset[key]=templates/index.json`, {
  headers,
}).then((r) => r.json())
const idx = JSON.parse(raw.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
for (const [k, b] of Object.entries(idx.sections.blocks_C9E4qf.blocks)) {
  if (k.startsWith('ai_gen_block_8d967d7')) {
    console.log(k, '=>', JSON.stringify({ link: b.settings.button_link, text: b.settings.button_text }))
  }
}
console.log('raw contains "12-months":', raw.asset.value.includes('12-months'))
console.log('raw contains "plans\\/12-months":', raw.asset.value.includes('plans\\/12-months'))

const listing = await fetch(`${REST}/themes/${THEME}/assets.json`, { headers }).then((r) => r.json())
console.log(
  '\nindex-ish templates:',
  listing.assets.map((a) => a.key).filter((k) => /^templates\/index/.test(k))
)
console.log(
  'layout files:',
  listing.assets.map((a) => a.key).filter((k) => /^layout\//.test(k))
)

const probes = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
]
for (const url of probes) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 verify' } })
  const html = await res.text()
  console.log(`\n--- ${url} (${res.status}) ---`)
  console.log('Book Consultation:', html.includes('Book Consultation'))
  console.log('Talk To A Coach:', html.includes('Talk To A Coach'))
  console.log('talk highlight css:', html.includes('lurvox-talk-cta-highlight'))
  console.log('GET THE 12-MONTH PLAN:', html.includes('GET THE 12-MONTH PLAN'))
  console.log('countdown persist:', html.includes('lurvox-urgency-countdown-end-v1'))
  console.log('fab section count:', (html.match(/lurvox-fab__shell/g) || []).length)
  const ids = [...html.matchAll(/id="(shopify-section-[^"]+)"/g)].map((m) => m[1])
  console.log('section ids:', ids.join(' | '))
}
