import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token.access_token, 'Content-Type': 'application/json' }
const themeId = '161112981755'

const get = await fetch(
  `${REST}/themes/${themeId}/assets.json?asset[key]=sections/header-group.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
)
const json = await get.json()
let content = json.asset?.value || ''
console.log('before talk urls', [...content.matchAll(/talk[^"]*/g)].slice(0, 20).map((m) => m[0]))

content = content.replaceAll('/pages/talk-to-a-coach', '/pages/talk-coach')
content = content.replaceAll('talk-to-a-coach', 'talk-coach')

const put = await fetch(`${REST}/themes/${themeId}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'sections/header-group.json', value: content } }),
})
console.log('header put', put.status)

// Also check footer again and any ai header blocks
for (const key of [
  'sections/footer-group.json',
  'layout/theme.liquid',
  'sections/mobile-floating-bar.liquid',
]) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token.access_token },
  })
  const j = await r.json()
  let v = j.asset?.value || ''
  const updated = v.replaceAll('/pages/talk-to-a-coach', '/pages/talk-coach')
  if (updated !== v) {
    await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ asset: { key, value: updated } }),
    })
    console.log('updated', key)
  } else {
    console.log('no change', key, {
      talkCoach: (v.match(/\/pages\/talk-coach/g) || []).length,
      old: (v.match(/\/pages\/talk-to-a-coach/g) || []).length,
    })
  }
}
