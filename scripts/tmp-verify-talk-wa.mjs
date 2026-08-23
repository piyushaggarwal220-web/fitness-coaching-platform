const urls = [
  'https://www.lurvox.in/pages/talk-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://www.lurvox.in/?view=',
  'https://www.lurvox.in/',
]

for (const u of urls) {
  const res = await fetch(u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
  const loc = res.headers.get('location')
  let html = ''
  if (res.status === 200) html = await res.text()
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((h) => /talk|wa\.me/i.test(h))
  console.log(u, {
    status: res.status,
    loc,
    hasReplace: html.includes('location.replace'),
    hasWa: html.includes('wa.me/919220451577'),
    hrefs: [...new Set(hrefs)].slice(0, 10),
  })
}
