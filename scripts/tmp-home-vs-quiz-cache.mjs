async function grab(url) {
  const html = await (
    await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 verify', 'Cache-Control': 'no-cache' } })
  ).text()
  return {
    url,
    busts: html.match(/lurvox-cache-bust [^<]+/g),
    headerLogin: html.includes('lx-header-existing-login'),
    headerLoginJs: html.includes('lx-header-login'),
    clientLogin: html.includes('Already training with LURVOX'),
    ghar: /Ghar ka khana/.test(html),
  }
}

const t = Date.now()
console.log(
  JSON.stringify(
    await grab(`https://www.lurvox.in/?cb=${t}`),
    null,
    2
  )
)
console.log(
  JSON.stringify(
    await grab(`https://www.lurvox.in/pages/find-your-plan?sections=template&cb=${t}`),
    null,
    2
  )
)
const sec = await fetch(
  `https://www.lurvox.in/pages/find-your-plan?sections=template&cb=${t}`,
  { headers: { 'User-Agent': 'Mozilla/5.0 verify' } }
)
const text = await sec.text()
console.log('sections ctype', sec.headers.get('content-type'))
console.log('ghar in sections', /Ghar ka khana/.test(text))
console.log('home cooked in sections', /Home cooked food/.test(text))
console.log('head', text.slice(0, 200))
