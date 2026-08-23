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

async function setTemplate(pageId, suffix) {
  const r = await fetch(`${API}/pages/${pageId}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: pageId, template_suffix: suffix } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 300))
  console.log('page', pageId, '->', j.page.template_suffix, j.page.updated_at)
}

const PAGE = 134354239739
const ALT = 134259540219 // talk-coach

// Brief clear then restore template suffix
await setTemplate(PAGE, null)
await setTemplate(ALT, null)
await new Promise((r) => setTimeout(r, 3000))
await setTemplate(PAGE, 'talk-to-a-coach')
await setTemplate(ALT, 'talk-to-a-coach')

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
    has179: /₹179/.test(html),
    has3m: /3 Months/i.test(html),
  }
}

for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const handle of ['talk-to-a-coach', 'talk-coach']) {
    const html = await (
      await fetch(`https://www.lurvox.in/pages/${handle}?swap=${Date.now()}&i=${i}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
          'Cache-Control': 'no-cache',
        },
      })
    ).text()
    const state = { handle, ...probe(html) }
    console.log(i, JSON.stringify(state))
    if (!state.has7Day && !state.has179 && state.has3m) {
      console.log('SUCCESS on', handle)
      process.exit(0)
    }
  }
}

console.log('template swapped; check Theme Editor Save if still sticky')
