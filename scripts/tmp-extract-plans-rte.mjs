const html = await fetch('https://www.lurvox.in/pages/plans?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

const rte = html.match(/lurvox-page-rte[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || ''
const text = rte.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim()
console.log('--- RTE TEXT ---')
console.log(text)
console.log('--- FLAGS ---')
console.log({
  has1MonthDash: /1 Month\s*—/.test(rte) || /1 Month\s*-/.test(rte),
  has1Month: /(?<!\d)1 Month/.test(rte),
  has3: /3 Months/.test(rte),
  hasCheckout1: rte.includes('plan=1_month') || rte.includes('1-month'),
  allMonthMentions: [...rte.matchAll(/[^<>]{0,20}\d+\s*Months?[^<>]{0,40}/gi)].map((m) =>
    m[0].replace(/\s+/g, ' ').trim()
  ),
})

// Home: can we hide via CSS injection in a way that works?
// Section API for hide section still works - use client-side fetch? Too hacky.
const home = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
console.log('home plan durations', [...home.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map(m=>m[1].trim()))
console.log('home has hide style', home.includes('lurvox-hide-1month-style'))
