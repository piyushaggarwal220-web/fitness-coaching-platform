import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const KEY = 'sections/lurvox-hide-1month.liquid'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function get() {
  return fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
    .then((r) => r.json())
    .then((j) => j.asset.value)
}

let src = await get()
console.log('before len', src.length, 'has WA', src.includes('var WA='))

// Keep everything before the WA force comment; drop the force script entirely
const cut = src.search(/{%\s*comment\s*%}\s*lurvox-talk-wa-force-v1\s*{%\s*endcomment\s*%}/)
if (cut >= 0) {
  src = src.slice(0, cut).trimEnd() + '\n'
} else {
  src = src.replace(/<script\b[^>]*>[\s\S]*?var WA=[\s\S]*?<\/script>/gi, '')
  src = src.replace(/{%\s*comment\s*%}\s*lurvox-talk-wa-force-v1\s*{%\s*endcomment\s*%}/g, '')
}

src += '\n<!-- lurvox: WA talk force removed from hide-1month -->\n'
console.log('after len', src.length, 'has WA', src.includes('var WA='))

const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: src } }),
}).then(async (r) => ({ status: r.status, body: await r.json() }))
console.log('put', put.status, put.body.errors || put.body.asset?.updated_at)

await new Promise((r) => setTimeout(r, 3000))
const verify = await get()
console.log({
  len: verify.length,
  hasVarWA: verify.includes('var WA='),
  hasRemovedMarker: verify.includes('WA talk force removed'),
  tail: verify.slice(-400),
})
