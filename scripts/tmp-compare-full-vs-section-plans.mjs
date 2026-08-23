const cb = Date.now()
const full = await fetch(`https://www.lurvox.in/pages/plans?cb=${cb}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then(async (r) => ({ status: r.status, headers: Object.fromEntries(r.headers), html: await r.text() }))

const sec = await fetch(`https://www.lurvox.in/pages/plans?sections=lurvox-page-content&cb=${cb}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.json())

const secHtml = sec['lurvox-page-content'] || ''
const fullRte = full.html.match(/lurvox-page-rte[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || ''

console.log({
  fullHas1: /1 Month\s*—/.test(fullRte),
  fullHasUpdated: fullRte.includes('UPDATED_'),
  fullHas3: /3 Months\s*—/.test(fullRte),
  secHas1: /1 Month\s*—/.test(secHtml),
  secHasUpdated: secHtml.includes('UPDATED_'),
  secHas3: /3 Months\s*—/.test(secHtml),
  secSnippet: secHtml.replace(/\s+/g, ' ').match(/Plans[\s\S]{0,250}/)?.[0],
  fullSnippet: fullRte.replace(/\s+/g, ' ').match(/Plans[\s\S]{0,250}/)?.[0],
})

// Look for Shopify.meta or page id
const meta = full.html.match(/var meta\s*=\s*(\{[\s\S]*?\});/)
if (meta) {
  try {
    console.log('meta', JSON.parse(meta[1]))
  } catch {
    console.log('meta raw', meta[1].slice(0, 400))
  }
}
console.log('page title h1', full.html.match(/<h1[^>]*>\s*([^<]+)/)?.[1])
