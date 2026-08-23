import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

for (const key of ['assets/lurvox-hide-1month.js', 'sections/lurvox-hide-1month.liquid']) {
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  const v = j.asset?.value || ''
  console.log(key, 'len', v.length)
  const i = v.indexOf('wa.me')
  if (i >= 0) console.log(v.slice(Math.max(0, i - 200), i + 250))
}
