const urls = [
  ['home', 'https://www.lurvox.in/'],
  ['view', 'https://www.lurvox.in/?view='],
  ['plans', 'https://www.lurvox.in/pages/plans'],
  ['coaching', 'https://www.lurvox.in/pages/coaching-plans'],
]

function extract(html) {
  const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  const prices = [...html.matchAll(/plan-card-price[^>]*>\s*([^<]+)/gi)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const rte = [...html.matchAll(/(\d+\s*Months?)\s*[—\-]\s*([^<\n]+)/gi)]
    .map((m) => `${m[1]} — ${m[2]}`.replace(/\s+/g, ' ').trim())
    .slice(0, 6)
  return {
    group: html.match(/sections--(\d+)__/)?.[1],
    themeNum: [...new Set([...html.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1]))],
    durations,
    prices,
    rte,
    has499: /Rs(?:&nbsp;|\s)*499|₹\s*499|(?<!\d)1 Month/.test(html),
    hide: html.includes('lurvox-hide-1month-style') || html.includes('data-lurvox-hide-1month'),
  }
}

for (const [name, url] of urls) {
  const html = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log('\n' + name, extract(html))
}
