const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('i want a free consultation call and more info')

const r = await fetch('https://www.lurvox.in/pages/talk-to-a-coach', {
  redirect: 'manual',
  headers: { 'User-Agent': 'Mozilla/5.0' },
})
console.log('talk-to-a-coach', r.status, r.headers.get('location'))
console.log('expected', WA)
console.log('match', r.headers.get('location') === WA)

const home = await fetch('https://www.lurvox.in/?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((x) => x.text())
const talkHrefs = [...home.matchAll(/href=["']([^"']*talk[^"']*)["']/gi)].map((m) => m[1])
console.log('home talk hrefs', [...new Set(talkHrefs)])
