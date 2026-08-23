import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

const list = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, { headers }).then((r) =>
  r.json()
)
const keys = (list.assets || [])
  .map((a) => a.key)
  .filter((k) => /\.(liquid|json)$/.test(k))

const hits = []
for (const key of keys) {
  if (/locales\//.test(key)) continue
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  const v = j.asset?.value || ''
  if (/wa\.me\/919220451577[^"'\n]*consult/i.test(v)) {
    hits.push(key)
  }
}
console.log('assets still linking WA consultation:', hits)
