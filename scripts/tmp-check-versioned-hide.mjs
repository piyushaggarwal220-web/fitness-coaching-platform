const urls = [
  'https://www.lurvox.in/cdn/shop/t/24/assets/lurvox-hide-1month.js?v=173622349671609679121785954125',
  'https://www.lurvox.in/cdn/shop/t/24/assets/lurvox-hide-1month.js?v=1785959679',
  'https://cdn.shopify.com/s/files/1/0815/3133/9003/t/24/assets/lurvox-hide-1month.js?v=1785959679',
  'https://cdn.shopify.com/s/files/1/0815/3133/9003/t/24/assets/lurvox-hide-1month.js?v=173622349671609679121785954125',
]

for (const u of urls) {
  const r = await fetch(u, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' } })
  const txt = await r.text()
  console.log({
    u: u.replace('https://', '').slice(0, 100),
    status: r.status,
    hasOverlay: /lurvoxOfferOverlay|SAVE5|SALE ENDS IN/.test(txt),
    len: txt.length,
  })
}

// Also dump exact script tags from live HTML
const html = await fetch('https://www.lurvox.in/index?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
const hideScripts = [...html.matchAll(/[^"'=\s]*lurvox-hide-1month\.js[^"'\s]*/g)].map((m) => m[0])
console.log('hide scripts in html', hideScripts)
