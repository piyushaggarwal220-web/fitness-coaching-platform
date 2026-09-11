import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
  .access_token
const H = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${REST}/themes.json`, { headers: H })).json()
const main = themes.themes.find((t) => t.role === 'main')
const assets = (await (await fetch(`${REST}/themes/${main.id}/assets.json`, { headers: H })).json())
  .assets
const needle =
  /Start in 90 days|START — Rs|looking sharp on a special event|Coach sign in|data-cta-price/g

for (const asset of assets) {
  if (!/\.(liquid|json|js)$/i.test(asset.key)) continue
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(asset.key)}`,
    { headers: H }
  )
  if (!res.ok) continue
  const value = (await res.json()).asset?.value || ''
  const matches = [...value.matchAll(needle)].map((m) => m[0])
  if (matches.length) console.log(asset.key, [...new Set(matches)].join(' | '))
}
