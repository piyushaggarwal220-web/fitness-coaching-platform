const html = await (
  await fetch(`https://www.lurvox.in/?scan=${Date.now()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
    },
  })
).text()

const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
console.log(
  'script srcs',
  scripts.filter((s) => /lurvox|hide|tap|custom/i.test(s) || /t\/\d+\/assets/.test(s)).slice(0, 40)
)
console.log(
  'all theme asset scripts',
  scripts.filter((s) => /cdn\.shopify\.com.*\/assets\//.test(s)).slice(0, 30)
)
console.log('sections group', html.match(/sections--(\d+)__/))
console.log('Shopify.theme', html.match(/Shopify\.theme\s*=\s*(\{[^;]+)/)?.[1]?.slice(0, 200))
console.log('theme store id markers', [...html.matchAll(/"theme_store_id":[^,]+/g)].slice(0, 5))
console.log('has hide js inline', html.includes('showTrialPlan') || html.includes('lurvox-hide-1month'))
console.log('inline script sample around plan', (() => {
  const i = html.indexOf('TransformationPlanSelector')
  return i >= 0 ? html.slice(i, i + 400) : 'not found'
})())
