import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const themes = await fetch(`${REST}/themes.json`, { headers }).then((r) => r.json())
const live = themes.themes.find((t) => t.role === 'main')
console.log('theme', live.id, live.name)

const raw = await fetch(
  `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`,
  { headers }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

fs.writeFileSync('scripts/tmp-live-index-now.json', raw)
console.log('dead anchors:', (raw.match(/shopify-section-blocks_C9E4qf/g) || []).length)
console.log('12-month links:', (raw.match(/plans\/12-months/g) || []).length)
console.log('GET THE 12-MONTH PLAN:', raw.includes('GET THE 12-MONTH PLAN'))

const index = JSON.parse(raw.replace(/^\/\*[\s\S]*?\*\//, ''))
for (const [secId, section] of Object.entries(index.sections ?? {})) {
  for (const [blockId, block] of Object.entries(section.blocks ?? {})) {
    const s = block.settings || {}
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'string') continue
      if (/CHOOSE|GET THE 12|C9E4qf|12-months|button_link|button_text/i.test(`${k}=${v}`)) {
        if (/link|url|text|headline|subheadline/i.test(k)) {
          console.log(`${secId}/${blockId} (${block.type}) ${k}=${JSON.stringify(v).slice(0, 120)}`)
        }
      }
    }
  }
}
