const res = await fetch('https://www.lurvox.in/pages/find-your-plan?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0 verify', 'Cache-Control': 'no-cache' },
})
console.log(res.status)
for (const [k, v] of res.headers) {
  if (/cache|age|cf-|shopify|x-/i.test(k)) console.log(k, v)
}
const html = await res.text()
console.log('has Ghar', /Ghar ka khana/.test(html))
console.log('has Home cooked', /Home cooked food\. Keep it simple/.test(html))
console.log('busts', html.match(/lurvox-cache-bust [^<]+/g))
console.log('plan finder comment', html.includes('Find your plan (tap quiz)'))
console.log('cache-bust 1786438000001 in html', html.includes('1786438000001'))
