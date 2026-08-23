import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

for (const key of [
  'layout/theme.liquid',
  'sections/lurvox-hide-1month.liquid',
  'sections/mobile-floating-bar.liquid',
]) {
  const v = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
    .then((r) => r.json())
    .then((j) => j.asset.value)
  const matches = [...v.matchAll(/wa\.me\/919220451577[^"'\n]{0,120}/gi)].map((m) => m[0])
  console.log('\n', key)
  console.log(matches)
}
