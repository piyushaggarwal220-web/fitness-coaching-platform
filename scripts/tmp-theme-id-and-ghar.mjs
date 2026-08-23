const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?cb=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 verify' },
  })
).text()

const theme = html.match(/Shopify\.theme\s*=\s*(\{[^;]+\});/)
const id = html.match(/"themeId"\s*:\s*"?(\d+)/) || html.match(/theme_store_id|Shopify\.theme/)
console.log('theme json', theme ? theme[1].slice(0, 250) : 'none')
console.log('has cache bust', /lurvox-cache-bust/.test(html))
const busts = html.match(/lurvox-cache-bust[^<]*/g)
console.log('busts', busts)
console.log('ghar', /ghar[-\s]?ka[-\s]?khana/i.test(html))
console.log('len', html.length)
console.log('shopify section', (html.match(/shopify-section/g) || []).length)
