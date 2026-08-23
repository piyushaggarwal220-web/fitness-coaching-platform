const home = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
const plans = await fetch('https://www.lurvox.in/pages/plans?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
const coaching = await fetch('https://www.lurvox.in/pages/coaching-plans?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

function report(name, html) {
  const ids = [...html.matchAll(/id="shopify-section-([^"]*lurvox[^"]*)"/g)].map((m) => m[1])
  console.log(name, {
    hasHideStyle: html.includes('lurvox-hide-1month-style'),
    hasHideMarker: html.includes('data-lurvox-hide-1month'),
    hideSections: ids,
    planDurations: [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map((m) =>
      m[1].trim()
    ),
    has1MonthDash: /1 Month\s*—/.test(html),
    hasPlanIndex1: html.includes('data-plan-index="1"'),
  })
}

report('HOME', home)
report('PLANS', plans)
report('COACHING', coaching)
