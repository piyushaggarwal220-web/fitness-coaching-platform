import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const live = themes.find((t) => t.role === 'main')

const index = await (
  await fetch(
    `${REST}/themes/${live.id}/assets.json?asset[key]=templates/index.json&t=${Date.now()}`,
    { headers }
  )
).json()
const idx = JSON.parse(index.asset.value)
console.log('index has hide section', !!idx.sections?.lurvox_hide_1month, idx.order?.slice(-5))
console.log('index updated_at', index.asset.updated_at)

const section = await (
  await fetch(
    `${REST}/themes/${live.id}/assets.json?asset[key]=sections/lurvox-hide-1month.liquid&t=${Date.now()}`,
    { headers }
  )
).json()
console.log('section exists', !!section.asset?.value, 'bytes', section.asset?.value?.length)

// Section rendering API
for (const url of [
  `https://9uwyq1-0j.myshopify.com/?sections=lurvox-hide-1month&cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?sections=lurvox_hide_1month&cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${live.id}&sections=lurvox-hide-1month&cb=${Date.now()}`,
  `https://www.lurvox.in/?sections=lurvox-hide-1month&cb=${Date.now()}`,
]) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const text = await res.text()
  console.log(url.split('?')[0], res.status, {
    ct: res.headers.get('content-type'),
    cache: res.headers.get('cache-control'),
    cf: res.headers.get('cf-cache-status'),
    hasMarker: text.includes('lurvox-hide-1month'),
    snippet: text.replace(/\s+/g, ' ').slice(0, 180),
  })
}

// Home headers
const homeRes = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
})
console.log('home headers', {
  status: homeRes.status,
  cache: homeRes.headers.get('cache-control'),
  cf: homeRes.headers.get('cf-cache-status'),
  age: homeRes.headers.get('age'),
  xcache: homeRes.headers.get('x-cache'),
  server: homeRes.headers.get('server'),
  powered: homeRes.headers.get('powered-by'),
  shopify: homeRes.headers.get('x-shopid') || homeRes.headers.get('x-sorting-hat-shopid'),
})

// Compare index.json content fingerprint in HTML vs API
const home = await homeRes.text()
console.log('home contains lurvox_hide', home.includes('lurvox_hide') || home.includes('lurvox-hide'))
console.log('home shopify-section ids sample', [...home.matchAll(/id="shopify-section-([^"]+)"/g)].map(m=>m[1]).slice(0, 20))
console.log('home section count', [...home.matchAll(/id="shopify-section-/g)].length)

// List last sections from API order and see if they appear
console.log('api order tail', idx.order?.slice(-8))
for (const id of (idx.order || []).slice(-8)) {
  const present = home.includes(`shopify-section-${id}`) || home.includes(id)
  console.log('  ', id, present)
}
