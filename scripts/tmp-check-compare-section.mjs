const sec = await fetch(
  `https://www.lurvox.in/?sections=lurvox-plan-compare&cb=${Date.now()}`
).then((r) => r.json())
console.log('keys', Object.keys(sec))
console.log('value', JSON.stringify(sec['lurvox-plan-compare'] || sec).slice(0, 800))

const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
console.log({
  hasCompareId: view.includes('compare-plans'),
  hasLxClass: view.includes('lx-plan-compare'),
  hasInlineMarker: view.includes('lurvox-plan-compare-inline'),
  hasSectionId: view.includes('lurvox_plan_compare'),
  hasCustomLiquidBlock: view.includes('lurvox_plan_compare_cl'),
  sectionIds: [...view.matchAll(/id="shopify-section-([^"]+)"/g)].map((m) => m[1]).slice(0, 15),
})
