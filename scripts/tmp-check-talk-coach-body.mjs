const html = await fetch('https://www.lurvox.in/pages/talk-coach?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

const replaces = [...html.matchAll(/location\.replace\(([^)]+)\)/g)].map((m) => m[1])
const refresh = [...html.matchAll(/content="0;url=([^"]+)"/g)].map((m) => m[1])
const allWa = [...html.matchAll(/https:\/\/wa\.me\/919220451577\?text=[^"'\\\s]+/g)].map(
  (m) => m[0]
)
console.log({ replaces, refresh, allWa: [...new Set(allWa)] })
console.log('has stamp', html.includes('lurvox-talk-wa-redirect'))
console.log('snippet', html.includes('free%20consultation') || html.includes('free consultation'))
