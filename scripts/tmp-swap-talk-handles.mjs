import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const STUCK = 134354239739 // talk-to-a-coach (cached with 7-day)
const CLEAN = 134259540219 // talk-coach (already clean)

async function updatePage(id, fields) {
  const r = await fetch(`${API}/pages/${id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id, ...fields } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 400))
  console.log('page', id, '->', j.page.handle, 'template=', j.page.template_suffix)
  return j.page
}

const temp = `talk-to-a-coach-old-${Date.now()}`
await updatePage(STUCK, { handle: temp, published: false })
await updatePage(CLEAN, {
  handle: 'talk-to-a-coach',
  title: 'Book a free consultation call',
  template_suffix: 'talk-to-a-coach',
  published: true,
})

// Optional redirect from temp if anyone bookmarked — skip since unpublished

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?h=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const state = {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
    has179: /₹179/.test(html),
    has3m: /3 Months/i.test(html),
    has6m: /6 Months/i.test(html),
    has12m: /12 Months/i.test(html),
  }
  console.log(i, JSON.stringify(state))
  if (!state.has7Day && !state.has179 && state.has3m && state.has6m && state.has12m) {
    console.log('SUCCESS')
    process.exit(0)
  }
}

process.exit(1)
