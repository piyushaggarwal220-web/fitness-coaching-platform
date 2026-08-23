import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const mainId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${mainId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

const assets = (await (await fetch(`${REST}/themes/${mainId}/assets.json`, { headers })).json()).assets
const parents = []
for (const a of assets) {
  if (!/\.liquid$/.test(a.key)) continue
  const val = await get(a.key)
  if (!val) continue
  if (val.includes('lurvox-plan-compare-inline')) parents.push(a.key)
}
console.log('parents', parents)

// Check if HTML is coming from Shopify Oxygen/edge cache - try alternate hosts
for (const url of [
  `https://9uwyq1-0j.myshopify.com/?v=${Date.now()}`,
  `https://www.lurvox.in/?v=${Date.now()}&view=`,
]) {
  try {
    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      redirect: 'follow',
    })
    const html = await res.text()
    const matrix = (html.match(/<strong>₹[^<]+<\/strong>/g) || []).slice(0, 12)
    console.log(url, res.status, matrix)
  } catch (e) {
    console.log(url, e.message)
  }
}
