const home = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const m = home.match(
  /id=["']shopify-section-sections--22212364173563__mobile_floating_bar["'][\s\S]{0,200}/
)
console.log('in page floating start', m?.[0]?.slice(0, 200))
console.log('in page has hide style', home.includes('lurvox-hide-1month-style'))
console.log('in page has fab-v3', home.includes('fab-v3'))
console.log('in page has fab-v2', home.includes('fab-v2'))

const sec = await fetch(
  'https://www.lurvox.in/?sections=mobile-floating-bar&cb=' + Date.now(),
  { headers: { 'User-Agent': 'Mozilla/5.0' } }
).then((r) => r.json())
const fab = sec['mobile-floating-bar'] || ''
console.log('api has hide', fab.includes('lurvox-hide-1month-style'))
console.log('api has fab-v3', fab.includes('fab-v3'))
console.log('api marker', fab.includes('data-lurvox-hide-1month'))

// Can we request the exact section instance id?
const instance = 'sections--22212364173563__mobile_floating_bar'
for (const key of [
  instance,
  'mobile_floating_bar',
  'sections--22212364173563__mobile_floating_bar',
]) {
  const res = await fetch(`https://www.lurvox.in/?section_id=${encodeURIComponent(key)}&cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const text = await res.text()
  console.log('section_id', key, res.status, text.length, text.includes('lurvox-hide-1month-style'))
}
