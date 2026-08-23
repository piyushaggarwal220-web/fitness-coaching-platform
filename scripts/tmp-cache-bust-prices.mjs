const urls = [
  `https://www.lurvox.in/?view=&cb=${Date.now()}`,
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://www.lurvox.in/`,
]

for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': `LurvoxPriceBot/${Date.now()}`,
    },
  })
  const html = await res.text()
  const matrix = (html.match(/lx-matrix__table[\s\S]{0,420}/) || [''])[0].replace(/\s+/g, ' ')
  const prices = html.match(/<strong>₹[^<]+<\/strong>/g) || []
  console.log('\n', url)
  console.log(' len', html.length)
  console.log(' strong', prices.slice(0, 10))
  console.log(' old2699', /₹\s*2,?699/.test(html))
  console.log(' matrix', matrix.slice(0, 300))
  console.log(' cache', res.headers.get('x-cache') || res.headers.get('cf-cache-status') || res.headers.get('age'))
}
