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

const pages = await (await fetch(`${API}/pages.json?limit=250`, { headers })).json()
const talkPages = (pages.pages || []).filter((p) =>
  /talk|consult|coach|book/i.test(`${p.handle} ${p.title}`)
)
console.log(
  talkPages.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    template: p.template_suffix,
    published: p.published_at,
  }))
)

const target =
  talkPages.find((p) => p.handle === 'talk-to-a-coach') ||
  talkPages.find((p) => /talk-to-a-coach/i.test(p.handle))

if (!target) throw new Error('talk page not found')

// Touch page to bust storefront page cache
const body = (target.body_html || '').replace(
  /<!-- lurvox-page-bust \d+ -->/g,
  ''
)
const updatedBody = `<!-- lurvox-page-bust ${Date.now()} -->${body}`

const put = await fetch(`${API}/pages/${target.id}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    page: {
      id: target.id,
      body_html: updatedBody,
      template_suffix: target.template_suffix || 'talk-to-a-coach',
    },
  }),
})
const putJson = await put.json()
if (!put.ok || putJson.errors) throw new Error(JSON.stringify(putJson).slice(0, 400))
console.log('touched page', target.id, putJson.page?.updated_at)

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?bust=${Date.now()}&i=${i}`, {
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
    pageBust: html.includes('lurvox-page-bust'),
  }
  console.log(i, JSON.stringify(state))
  if (!state.has7Day && !state.has179 && state.has3m) {
    console.log('SUCCESS')
    process.exit(0)
  }
}

console.log('page touched; default URL may still need a moment')
