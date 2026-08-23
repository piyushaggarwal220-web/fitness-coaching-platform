import fs from 'node:fs'
import path from 'node:path'

const html = await fetch(`https://www.lurvox.in/index?cb=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const hide = html.match(/lurvox-hide-1month\.js[^"']*/)?.[0]
const scripts = [...html.matchAll(/\/cdn\/shop\/t\/(\d+)\/assets\/([^"'?]+)/g)].map(
  (m) => `t/${m[1]}/${m[2]}`
)
console.log('hide ref', hide)
console.log('unique asset themes', [...new Set(scripts.map((s) => s.split('/')[1]))])
console.log('Shopify.theme', html.match(/"name":"[^"]+","id":\d+/)?.[0])
console.log('markers', {
  offerHome: html.includes('lurvox-offer'),
  save5: html.includes('SAVE5'),
  oldLogin: /EXISTING CLIENT/i.test(html),
  price: html.includes('Price increases in'),
  choose: /Choose your plan/i.test(html),
})

if (hide) {
  const url = hide.startsWith('http')
    ? hide
    : hide.startsWith('//')
      ? 'https:' + hide
      : 'https://www.lurvox.in' + (hide.startsWith('/') ? hide : '/' + hide)
  // also try without version and with cache bust
  for (const u of [
    url,
    url.replace(/\?v=[^&]+/, '') + '?cb=' + Date.now(),
    'https://www.lurvox.in/cdn/shop/t/24/assets/lurvox-hide-1month.js?cb=' + Date.now(),
  ]) {
    const txt = await fetch(u, { headers: { 'Cache-Control': 'no-cache' } }).then((r) =>
      r.text()
    )
    console.log({
      u: u.slice(0, 120),
      hasOverlay: /lurvoxOfferOverlay|SAVE5|SALE ENDS IN/.test(txt),
      len: txt.length,
    })
  }
}
