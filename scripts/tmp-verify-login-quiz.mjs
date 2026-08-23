const token = JSON.parse(
  (await import('node:fs')).default.readFileSync(
    (await import('node:path')).default.join(process.env.TEMP, 'shopify-auth-token.json'),
    'utf8'
  )
).access_token
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const res = await fetch(
    `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`${key} ${res.status}`)
  return (await res.json()).asset.value
}

const layout = await get('layout/theme.liquid')
const finder = await get('sections/lurvox-plan-finder.liquid')
const home = await fetch('https://www.lurvox.in/?v=' + Date.now(), {
  headers: { 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
const quiz = await fetch('https://www.lurvox.in/pages/find-your-plan?v=' + Date.now(), {
  headers: { 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
const plan = await fetch('https://app.lurvox.in/plans/3-months', {
  headers: { 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

console.log(
  JSON.stringify(
    {
      layoutHasHeaderMatch: layout.includes("lurvox-header-match"),
      finderHasAutoJump: /location\.assign\(url\)/.test(finder),
      homeHasLoginRail: home.includes('lurvox-client-login'),
      homeHasAlreadyTraining: /Already training/i.test(home),
      homeHasHeaderLoginScript: home.includes('lx-header-login'),
      quizHasAutoJump: /location\.assign\(url\)/.test(quiz),
      quizHasSeeThisPlan: /See this plan/.test(quiz),
      livePlanHasLeague: /Consistency League/i.test(plan),
      livePlanHasWhoNeeds: /Who needs the 3 month plan/i.test(plan),
    },
    null,
    2
  )
)
