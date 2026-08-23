const t = Date.now()
const home = await (
  await fetch('https://www.lurvox.in/?cb=' + t, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
).text()
const plans = await (
  await fetch('https://www.lurvox.in/pages/plans?cb=' + t, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
).text()
const preview = await (
  await fetch('https://9uwyq1-0j.myshopify.com/?preview_theme_id=161112981755&cb=' + t, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
).text()

console.log({
  homeStyle: home.includes('lurvox-hide-1month-style'),
  homeMarker: home.includes('data-lurvox-hide-1month'),
  previewStyle: preview.includes('lurvox-hide-1month-style'),
  previewMarker: preview.includes('data-lurvox-hide-1month'),
  homeHasPlanIndex1: home.includes('data-plan-index="1"'),
  previewIndexes: [...preview.matchAll(/data-plan-index="(\d+)"/g)].map((m) => m[1]),
  plansStamp: plans.includes('lurvox-plans-no-1month'),
  plansExact1: /(?<!\d)1 Month/.test(plans),
  plansHas3: plans.includes('3 Months'),
  homeSectionType: home.includes('lurvox-hide-1month'),
  homeShopIdTheme: home.match(/Shopify\.theme\s*=\s*\{[\s\S]*?id:\s*(\d+)/)?.[1],
})
