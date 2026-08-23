import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

async function check(themeId) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent('sections/lurvox-talk-to-coach.liquid')}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  const v = j.asset?.value || ''
  console.log(themeId, {
    updated: j.asset?.updated_at,
    has7Day: /7-Day Trial|7-Day All-Access/i.test(v),
    has179: /₹179/.test(v),
    hasTrialClass: /lx-trial-plan/.test(v),
  })
}

await check('161390362875')
await check('161389281531')

// Try alternate talk page URL suffixes that sometimes bypass cache
for (const url of [
  `https://www.lurvox.in/pages/talk-to-a-coach?view=talk-to-a-coach&v=${Date.now()}`,
  `https://www.lurvox.in/pages/book-a-free-consultation?v=${Date.now()}`,
  `https://www.lurvox.in/pages/talk-to-a-coach?preview_theme_id=161390362875&v=${Date.now()}`,
]) {
  try {
    const html = await (
      await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126', 'Cache-Control': 'no-cache' },
      })
    ).text()
    console.log(url.split('?')[0].replace('https://www.lurvox.in', ''), {
      statusOk: html.length > 1000,
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
      has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
      has3m: /3 Months/i.test(html),
    })
  } catch (e) {
    console.log(url, e.message)
  }
}
