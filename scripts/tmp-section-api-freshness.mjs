// Check if section hydration / section renderer pulls fresh plan HTML
const home = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const sectionIds = [
  ...home.matchAll(/data-section-id=["']([^"']+)["']/gi),
].map((m) => m[1])
const sectionTypes = [
  ...home.matchAll(/data-section-type=["']([^"']+)["']/gi),
].map((m) => m[1])
const shopifySections = [
  ...home.matchAll(/id=["']shopify-section-([^"']+)["']/gi),
].map((m) => m[1])

console.log('section ids sample', [...new Set(sectionIds)].slice(0, 20))
console.log('section types', [...new Set(sectionTypes)].slice(0, 20))
console.log('shopify-section', [...new Set(shopifySections)].slice(0, 30))

// Find home_blocks / plan related
const planRelated = [...new Set(shopifySections)].filter((s) =>
  /plan|block|home|hide|compare/i.test(s)
)
console.log('plan related sections', planRelated)

// Fetch those sections via Section Rendering API
for (const id of planRelated.slice(0, 8)) {
  const typeGuess = id.replace(/^\d+/, '') // may not work
  try {
    const url = `https://www.lurvox.in/?sections=${encodeURIComponent(id)}&cb=${Date.now()}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const ct = res.headers.get('content-type') || ''
    let body = await res.text()
    let html = body
    if (ct.includes('json')) {
      try {
        const j = JSON.parse(body)
        html = j[id] || Object.values(j)[0] || ''
      } catch {}
    }
    const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean)
    const hide = html.includes('lurvox-hide-1month')
    console.log(id, {
      status: res.status,
      len: html.length,
      durations,
      hide,
      has499: /499/.test(html),
    })
  } catch (e) {
    console.log(id, e.message)
  }
}

// Also try known section types
for (const sec of [
  'lurvox-hide-1month',
  'mobile-floating-bar',
  'header-group',
  'footer-group',
]) {
  const j = await fetch(`https://www.lurvox.in/?sections=${sec}&cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.json())
  const html = j[sec] || ''
  console.log(
    'type',
    sec,
    html.length,
    'hide',
    html.includes('lurvox-hide-1month'),
    'durations',
    [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map((m) => m[1].trim())
  )
}
