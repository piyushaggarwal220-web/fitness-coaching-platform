const html = await fetch(`https://www.lurvox.in/pages/consistency-league?nocache=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
}).then((r) => r.text())

const idx = html.indexOf('lx-league__hero')
console.log('hero idx', idx)
console.log(html.slice(idx, idx + 500))
console.log('---')
console.log('back count', (html.match(/lx-league__back/g) || []).length)
console.log('brand count', (html.match(/lx-league__brand/g) || []).length)
