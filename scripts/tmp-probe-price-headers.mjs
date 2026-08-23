async function probe(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': `hdr/${Date.now()}`, 'Cache-Control': 'no-cache' },
  })
  const html = await res.text()
  const headers = {}
  res.headers.forEach((v, k) => {
    if (/cache|age|cf-|x-|server|vary|cdn|shopify/i.test(k)) headers[k] = v
  })
  return {
    url,
    status: res.status,
    len: html.length,
    old: /₹\s*2,?699/.test(html),
    prices: (html.match(/<strong>₹[^<]+<\/strong>/g) || []).slice(0, 5),
    headers,
  }
}

for (const url of [
  'https://www.lurvox.in/',
  `https://www.lurvox.in/?view=`,
  `https://www.lurvox.in/?preview_theme_id=161429127419`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=161429127419`,
]) {
  console.log(JSON.stringify(await probe(url), null, 2))
}
