import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const themeId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`${key} ${JSON.stringify(json).slice(0, 200)}`)
  return json.asset.value
}

for (const key of [
  'sections/lurvox-hide-1month.liquid',
  'assets/base.css',
]) {
  const v = await get(key)
  fs.writeFileSync(`scripts/tmp-live-${key.replace(/\//g, '__')}`, v)
  console.log('saved', key, v.length)
}

const index = await get('templates/index.json')
fs.writeFileSync('scripts/tmp-index-price-cards.json', index)
// find hide snippets in index
const re = /Hide retired[\s\S]{0,400}|lurvox-hide-1month[\s\S]{0,400}|data-plan-price=\\?"999\\?"[\s\S]{0,200}/g
let m
let n = 0
while ((m = re.exec(index)) && n < 8) {
  console.log('INDEX HIT', n, m[0].replace(/\n/g, ' ').slice(0, 350))
  n++
}
