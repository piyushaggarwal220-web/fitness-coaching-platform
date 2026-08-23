const html = await fetch('https://www.lurvox.in/?v=planfunnelcheck2', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
const hrefs = [...html.matchAll(/href="([^"]*checkout[^"]*)"/g)].map((m) => m[1])
console.log(hrefs)
