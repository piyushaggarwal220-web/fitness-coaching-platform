const urls = [
  'https://www.lurvox.in/pages/find-your-plan',
  'https://9uwyq1-0j.myshopify.com/pages/find-your-plan',
]

async function check(url) {
  const html = await (
    await fetch(`${url}?cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 verify' },
    })
  ).text()
  return {
    url,
    newBust: html.includes('lurvox-cache-bust 1786438330339'),
    oldBust: html.includes('lurvox-cache-bust 1786436062023'),
    ghar: /ghar[-\s]?ka[-\s]?khana/i.test(html),
    homeCooked: /Home cooked food\. Keep it simple/.test(html),
  }
}

for (let i = 0; i < 8; i += 1) {
  const rows = []
  for (const url of urls) rows.push(await check(url))
  console.log(i, JSON.stringify(rows))
  if (rows.every((r) => r.homeCooked && !r.ghar)) break
  await new Promise((r) => setTimeout(r, 8000))
}
