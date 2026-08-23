import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const text = await res.text()
  if (!text?.trim()) return null
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    return null
  }
}

const assets = (await (await fetch(`${REST}/themes/${main.id}/assets.json`, { headers })).json())
  .assets
const needle = /Popular[\s\S]{0,80}2,?699|2,?699[\s\S]{0,80}Best value|is-best/
const found = []
for (const a of assets) {
  if (!/\.(liquid|json)$/.test(a.key)) continue
  if (a.key.startsWith('assets/')) continue
  const val = await get(a.key)
  if (!val) continue
  if (needle.test(val) || (val.includes('is-best') && /2,?699|3,?699/.test(val))) {
    found.push(a.key)
  }
}
console.log('found', found)

for (const key of found) {
  const val = await get(key)
  const idx = val.search(/2,?699/)
  console.log('\n', key, 'snippet:', val.slice(Math.max(0, idx - 100), idx + 120).replace(/\s+/g, ' '))
}
