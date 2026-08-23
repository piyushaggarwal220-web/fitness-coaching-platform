import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const live = themes.themes.find((t) => t.role === 'main')
const key = 'templates/index.json'
const res = await fetch(
  `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
  { headers }
)
const val = (await res.json()).asset.value
fs.writeFileSync('scripts/tmp-live-index.json', val)

// Find plan price-related settings
const matches = []
const re = /"(plan_\d+_(?:price|original_price|monthly|savings|badge))"\s*:\s*"([^"]*)"/g
let m
while ((m = re.exec(val))) {
  matches.push({ key: m[1], value: m[2] })
}
const rupeeInIndex = (val.match(/₹/g) || []).length
console.log(JSON.stringify({ themeId: live.id, rupeeInIndex, planSettings: matches }, null, 2))
