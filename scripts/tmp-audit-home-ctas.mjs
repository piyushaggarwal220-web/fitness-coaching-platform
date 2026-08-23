import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

const index = JSON.parse(indexAsset.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))

const hits = []
const walk = (node, trail) => {
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    const nextTrail = `${trail}.${key}`
    if (typeof value === 'string') {
      if (/link|url|href|cta/i.test(key)) hits.push({ path: nextTrail, value })
    } else {
      walk(value, nextTrail)
    }
  }
}
walk(index.sections, 'sections')

console.log('=== link settings in templates/index.json ===')
for (const hit of hits) console.log(hit.path, '=>', JSON.stringify(hit.value))

console.log('\n=== section order ===')
console.log(JSON.stringify(index.order, null, 2))

const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  cache: 'no-store',
  headers: { 'User-Agent': 'Mozilla/5.0 audit' },
}).then((r) => r.text())

const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]{0,140}?)<\/a>/gi)].map(
  (m) => ({
    href: m[1],
    text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70),
  })
)

console.log('\n=== live homepage anchors ===')
for (const a of anchors) console.log(`${a.href}  |  ${a.text}`)

console.log('\n=== anchor id targets present? ===')
const ids = [...html.matchAll(/id="(shopify-section-[^"]+)"/g)].map((m) => m[1])
console.log(ids.join('\n'))

const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]{0,120}?)<\/button>/gi)].map((m) =>
  m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
)
console.log('\n=== buttons (no href) ===')
console.log(buttons.filter(Boolean).join('\n'))
