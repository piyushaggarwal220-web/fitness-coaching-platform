const urls = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/?view=',
  'https://www.lurvox.in/pages/plans',
  'https://www.lurvox.in/pages/plans?view=',
  'https://www.lurvox.in/pages/coaching-plans',
]

function extractPrices(html) {
  const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map((m) =>
    m[1].trim()
  )
  const prices = [...html.matchAll(/plan-card-price[^>]*>\s*([^<]+)/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  )
  const monthlies = [...html.matchAll(/plan-card-monthly[^>]*>\s*([^<]+)/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  )
  const rtePlans = [...html.matchAll(/(\d+\s*Months?)\s*[—\-]\s*([^<\n]+)/gi)].map((m) =>
    `${m[1]} — ${m[2]}`.replace(/\s+/g, ' ').trim()
  )
  const amounts = [...html.matchAll(/(?:Rs\.?\s*|₹)\s*([\d,]+)/gi)]
    .map((m) => m[0].replace(/\s+/g, ' '))
    .slice(0, 20)
  return { durations, prices, monthlies, rtePlans: rtePlans.slice(0, 8), amounts }
}

for (const url of urls) {
  const html = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log('\n===', url)
  console.log(extractPrices(html))
}
