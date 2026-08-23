/** Slow, spaced page checks so Shopify's burst throttling can't masquerade as breakage. */
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PATHS = [
  '/',
  '/pages/league',
  '/pages/consistency-league',
  '/pages/talk-to-a-coach',
  '/pages/plans',
  '/pages/coaching-plans',
  '/pages/subscribe',
  '/pages/transform',
  '/pages/payment-success',
  '/pages/about',
  '/pages/privacy-policy',
  '/pages/refund-and-cancellation-policy',
  '/pages/terms-and-conditions',
  '/pages/shipping-policy',
  '/pages/faq',
]

const results = []
for (const p of PATHS) {
  let attempt = 0
  let entry = null
  while (attempt < 3) {
    attempt += 1
    await sleep(attempt === 1 ? 6000 : 12000)
    const res = await fetch(`https://www.lurvox.in${p}?t=${Date.now()}`, {
      headers: UA,
      redirect: 'follow',
    })
    const body = await res.text()
    entry = {
      path: p,
      attempt,
      status: res.status,
      finalPath: new URL(res.url).pathname,
      bytes: body.length,
      title: (body.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 50),
    }
    if (res.status !== 503) break
  }
  results.push(entry)
  console.log(JSON.stringify(entry))
}

const bad = results.filter((r) => r.status >= 400)
console.log('\n--- SUMMARY ---')
console.log(JSON.stringify({ checked: results.length, failing: bad }, null, 2))
