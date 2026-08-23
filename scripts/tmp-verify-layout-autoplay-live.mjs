import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const headers = { 'X-Shopify-Access-Token': token }

const layout = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=layout/theme.liquid`,
  { headers }
).then((r) => r.json())

const val = layout.asset.value
console.log({
  updated_at: layout.asset.updated_at,
  bytes: val.length,
  hasMarker: val.includes('lurvox-photo-carousel-autoplay-v1'),
  hasTalk: val.includes('lurvox-talk-cta-highlight'),
  hasAutoMs: val.includes('AUTO_MS = 3500'),
  tail: val.slice(-800),
})

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`,
]

for (const url of urls) {
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  })
  const html = await res.text()
  console.log({
    url,
    status: res.status,
    age: res.headers.get('age'),
    cf: res.headers.get('cf-cache-status'),
    xcache: res.headers.get('x-cache'),
    shopify: res.headers.get('x-shopify-stage'),
    marker: html.includes('lurvox-photo-carousel-autoplay-v1'),
    talk: html.includes('lurvox-talk-cta-highlight'),
    autoMs: html.includes('AUTO_MS = 3500'),
    templateAttr: (html.match(/data-template="[^"]*"/) || [])[0],
  })
}
