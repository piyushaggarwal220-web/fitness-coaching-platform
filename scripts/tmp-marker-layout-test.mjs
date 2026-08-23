import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MAIN = 161429127419
const MARKER = `LXPRICE999_${Date.now()}`

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${MAIN}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

async function put(key, value) {
  const res = await fetch(`${REST}/themes/${MAIN}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json).slice(0, 400))
  console.log('put', key)
}

const layout = await get('layout/theme.liquid')
if (!layout.includes(MARKER)) {
  const next = layout.replace(
    '</head>',
    `<meta name="lx-price-stamp" content="${MARKER}" />\n</head>`
  )
  await put('layout/theme.liquid', next)
}

await new Promise((r) => setTimeout(r, 4000))
for (const url of [`https://www.lurvox.in/`, `https://www.lurvox.in/?view=`, `https://www.lurvox.in/?cb=${Date.now()}`]) {
  const html = await (await fetch(url + (url.includes('?') ? '&' : '?') + 'x=' + Date.now(), {
    headers: { 'User-Agent': MARKER },
  })).text()
  console.log(url, {
    hasMarker: html.includes(MARKER),
    old2699: /₹\s*2,?699/.test(html),
    prices: (html.match(/<strong>₹[^<]+<\/strong>/g) || []).slice(0, 4),
    len: html.length,
  })
}

// Confirm API index custom liquid now has 999
const index = await get('templates/index.json')
console.log('index has 999 inlined', /₹999/.test(index))
console.log('index has 2699', /2,?699/.test(index))
console.log('index has inline matrix comment', /inline matrix/.test(index))
