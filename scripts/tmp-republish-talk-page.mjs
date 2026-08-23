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

const PAGE = 134354239739

// Unpublish then republish talk-to-a-coach
async function setPublished(published) {
  const r = await fetch(`${API}/pages/${PAGE}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      page: {
        id: PAGE,
        published,
        template_suffix: 'talk-to-a-coach',
      },
    }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j).slice(0, 300))
  console.log('published=', published, j.page.published_at, j.page.updated_at)
}

await setPublished(false)
await new Promise((r) => setTimeout(r, 4000))
await setPublished(true)

for (let i = 0; i < 16; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const results = {}
  for (const handle of ['talk-to-a-coach', 'talk-coach']) {
    const html = await (
      await fetch(`https://www.lurvox.in/pages/${handle}?rp=${Date.now()}&i=${i}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
          'Cache-Control': 'no-cache',
        },
      })
    ).text()
    results[handle] = {
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
      has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
      has179: /₹179/.test(html),
      has3m: /3 Months/i.test(html),
      statusish: html.includes('404') && html.length < 5000 ? 'maybe404' : 'ok',
    }
  }
  console.log(i, JSON.stringify(results))
  if (!results['talk-to-a-coach'].has7Day && results['talk-to-a-coach'].has3m) {
    console.log('SUCCESS')
    process.exit(0)
  }
}

console.log('done')
