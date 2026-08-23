const html = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

console.log('has force marker', html.includes('lurvox-talk-wa-force-v1'))
const idx = html.indexOf('lurvox-talk-wa-force')
console.log('snippet', html.slice(Math.max(0, idx), idx + 700))

const view = await fetch('https://www.lurvox.in/?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
console.log('\nview force', view.includes('lurvox-talk-wa-force-v1'))
const idx2 = view.indexOf('lurvox-talk-wa-force')
console.log('view snippet', view.slice(Math.max(0, idx2), idx2 + 700))

// Section API hide
const sec = await fetch('https://www.lurvox.in/?sections=lurvox-hide-1month&cb=' + Date.now()).then(
  (r) => r.json()
)
const s = sec['lurvox-hide-1month'] || ''
console.log('\nsection force', s.includes('lurvox-talk-wa-force-v1'))
console.log('section has consult msg', s.includes('free%20consultation'))
