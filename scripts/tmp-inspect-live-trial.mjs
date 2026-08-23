import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const THEME_ID = '161294057723'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }

const outDir = path.join(process.cwd(), 'scripts', 'tmp-live-price-review')
fs.mkdirSync(path.join(outDir, 'templates'), { recursive: true })
fs.mkdirSync(path.join(outDir, 'sections'), { recursive: true })
fs.mkdirSync(path.join(outDir, 'blocks'), { recursive: true })

async function get(key) {
  const r = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  if (!r.ok || !j.asset?.value) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  return j.asset.value
}

const index = await get('templates/index.json')
fs.writeFileSync(path.join(outDir, 'templates', 'index.json'), index)
const parsed = JSON.parse(index)

console.log('order:', parsed.order)
console.log(
  'sections:',
  Object.entries(parsed.sections || {}).map(([id, s]) => `${id}=${s.type}`)
)

// Find plan settings and trial mentions
for (const [sid, sec] of Object.entries(parsed.sections || {})) {
  if (sid.includes('trial') || sec.type?.includes('trial')) {
    console.log('\ntrial section', sid, sec.type, JSON.stringify(sec.settings || {}).slice(0, 200))
  }
  for (const [bid, blk] of Object.entries(sec.blocks || {})) {
    const s = blk.settings || {}
    const blob = JSON.stringify(s)
    if (/179|1_week|7.?day|trial|plan_1/i.test(blob) || /361650c|plan/i.test(blk.type || '')) {
      console.log(`\nblock ${sid}.${bid} type=${blk.type}`)
      if (s.plan_1_enabled != null || s.plan_1_price || s.plan_1_label) {
        console.log({
          plan_1_enabled: s.plan_1_enabled,
          plan_1_label: s.plan_1_label,
          plan_1_price: s.plan_1_price,
          plan_1_duration: s.plan_1_duration,
          plan_1_link: s.plan_1_link,
          plan_2_label: s.plan_2_label,
          cta_text: s.cta_text,
          subheadline: s.subheadline,
        })
      } else if (/179|trial|7.?day/i.test(blob)) {
        console.log('trial-ish settings keys:', Object.keys(s).filter((k) => /trial|179|7|plan_1|cta|title/i.test(k)))
        console.log(blob.slice(0, 400))
      }
    }
  }
}
