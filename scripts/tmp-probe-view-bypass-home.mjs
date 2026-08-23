const urls = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/?view=',
  'https://www.lurvox.in/?pb=0',
  'https://9uwyq1-0j.myshopify.com/',
  'https://9uwyq1-0j.myshopify.com/?view=',
  'https://www.lurvox.in/pages/plans?view=',
  'https://www.lurvox.in/pages/coaching-plans',
]

for (const url of urls) {
  const html = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const group = html.match(/sections--(\d+)__/)?.[1]
  console.log(url, {
    group,
    hide: html.includes('lurvox-hide-1month-style'),
    durations: [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean),
    has1Dash: /1 Month\s*—/.test(html),
  })
}
