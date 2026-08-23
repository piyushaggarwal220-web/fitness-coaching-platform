const r = await fetch('https://www.lurvox.in/pages/talk-to-a-coach', {
  redirect: 'manual',
  headers: { 'User-Agent': 'Mozilla/5.0' },
})
console.log('talk-to-a-coach', r.status, r.headers.get('location'))

const html = await fetch('https://www.lurvox.in/pages/talk-coach', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((x) => x.text())
const m = html.match(/wa\.me\/919220451577[^"'\\\s]*/)
console.log('talk-coach wa', m && m[0])
