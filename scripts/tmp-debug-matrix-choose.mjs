import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const themeId = 161429127419

const res = await fetch(
  `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`,
  { headers }
)
const json = await res.json()
const index = json.asset.value
fs.writeFileSync('scripts/tmp-index-choose-debug.json', index)

const needles = ['Choose</a>', 'Choose<\\/a>', 'plans/3-months', 'checkout?plan=3_months', 'Start ·']
for (const n of needles) {
  console.log(n, (index.split(n).length - 1))
}
const i = index.search(/Choose/i)
console.log('first Choose context', index.slice(Math.max(0, i - 100), i + 120))
