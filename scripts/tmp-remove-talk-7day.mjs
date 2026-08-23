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

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const liquid = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-live-talk', 'sections__lurvox-talk-to-coach.liquid'),
  'utf8'
)

if (/7-Day|₹179|lx-trial-plan/i.test(liquid)) {
  throw new Error('local liquid still contains trial')
}

const put = await fetch(`${API}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'sections/lurvox-talk-to-coach.liquid', value: liquid },
  }),
})
const putJson = await put.json()
if (!put.ok || putJson.errors) throw new Error(JSON.stringify(putJson).slice(0, 400))
console.log('updated sections/lurvox-talk-to-coach.liquid')

// also sync shopify-assets copy
fs.writeFileSync(
  path.join(process.cwd(), 'scripts', 'shopify-assets', 'sections-lurvox-talk-to-coach.liquid'),
  liquid
)

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const state = {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
    has179: /₹179|Rs\s*179/i.test(html),
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

console.log('deployed — page may still be flushing cache')
