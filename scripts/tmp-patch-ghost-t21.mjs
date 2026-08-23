import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const GHOST = '161294057723'
const MAIN = '161391804667'

// Try writing to ghost theme id
const overlay = await fetch(
  `${REST}/themes/${MAIN}/assets.json?asset[key]=assets/lurvox-offer-overlay.js`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())

const overlayJs = overlay.asset?.value
console.log('overlay len', overlayJs?.length)

for (const themeId of [GHOST, '161251328251']) {
  const hide = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent('assets/lurvox-hide-1month.js')}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.text())
  console.log('get', themeId, hide.slice(0, 200))

  if (overlayJs) {
    const put = await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        asset: {
          key: 'assets/lurvox-hide-1month.js',
          value:
            '/* ghost bypass */\n' +
            (JSON.parse(hide).asset?.value || '') +
            '\n/* lurvox-offer-overlay-v2 */\n' +
            overlayJs,
        },
      }),
    }).then((r) => r.text())
    console.log('put', themeId, put.slice(0, 300))
  }
}

// Probe t/20 and t/21
for (const t of [20, 21, 26]) {
  const u = `https://www.lurvox.in/cdn/shop/t/${t}/assets/lurvox-hide-1month.js?cb=${Date.now()}`
  const r = await fetch(u, { headers: { 'Cache-Control': 'no-cache' } })
  const txt = await r.text()
  console.log({
    t,
    status: r.status,
    hasOverlay: /lurvoxOfferOverlay|SAVE5|SALE ENDS IN/.test(txt),
    len: txt.length,
    head: txt.slice(0, 80).replace(/\s+/g, ' '),
  })
}
