const html = await (await fetch('https://www.lurvox.in/pages/talk-coach?t=' + Date.now())).text()
const i = html.indexOf('lurvox-talk-coach-form')
console.log(html.slice(i, i + 1200))
const j = html.indexOf('apiUrl')
console.log('apiUrl context', html.slice(j, j + 200))

const my = await fetch('https://9uwyq1-0j.myshopify.com/pages/talk-to-a-coach', { redirect: 'manual' })
console.log('myshopify', my.status, my.headers.get('location'))
