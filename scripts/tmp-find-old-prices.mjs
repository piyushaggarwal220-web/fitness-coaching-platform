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
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    return null
  }
}

const keys = [
  'snippets/lurvox-conversion-boost.liquid',
  'snippets/lurvox-sales-closer.liquid',
  'sections/lurvox-ad-landing.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'layout/theme.liquid',
  'sections/lurvox-social-proof.liquid',
]

for (const key of keys) {
  const val = await get(key)
  if (!val) {
    console.log(key, 'MISSING')
    continue
  }
  const old = {
    '2699': (val.match(/2,?699/g) || []).length,
    '3699': (val.match(/3,?699/g) || []).length,
    '1699': (val.match(/1,?699/g) || []).length,
    '566': (val.match(/566/g) || []).length,
    '999': (val.match(/(?<![0-9])999(?![0-9])/g) || []).length,
    '2999': (val.match(/2,?999/g) || []).length,
  }
  console.log(key, old)
}

// Also scan asset list for liquid containing old prices
const assetsRes = await fetch(`${REST}/themes/${main.id}/assets.json`, { headers })
const assets = (await assetsRes.json()).assets || []
const suspects = []
for (const a of assets) {
  if (!/\.(liquid|json)$/.test(a.key)) continue
  if (a.key.startsWith('assets/')) continue
  const val = await get(a.key)
  if (!val) continue
  if (/2,?699|3,?699|566\/mo|From ₹566|₹1,699/.test(val)) {
    suspects.push(a.key)
  }
}
console.log('suspectAssets', suspects)
