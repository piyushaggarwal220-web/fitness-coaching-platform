const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`,
  `https://www.lurvox.in/pages/league?cb=${Date.now()}`,
]

for (const url of urls) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
  const html = await res.text()
  console.log(`\n=== ${url} -> ${res.status} (${html.length} bytes) ===`)
  for (const [k, v] of res.headers.entries()) {
    if (/cache|age|server|shopify|cf-|via|x-|etag|last-modified|vary/i.test(k)) console.log(' ', k, '=', v)
  }
  const stamp = html.match(/shopify-section-template--(\d+)__/)
  console.log('  template id:', stamp?.[1] ?? 'n/a')
}
