import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(`${process.env.TEMP}/shopify-auth-token.json`, 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const pages = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/pages/find-your-plan',
  'https://www.lurvox.in/pages/how-lurvox-works',
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://www.lurvox.in/pages/consistency-league',
  'https://www.lurvox.in/pages/plans',
  'https://app.lurvox.in/plans/3-months',
  'https://app.lurvox.in/plans/6-months',
  'https://app.lurvox.in/plans/12-months',
]
for (const url of pages) {
  try {
    const html = await (await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
    })).text()
    const n = (html.match(/Consistency League/gi) || []).length
    const c = (html.match(/Crazy League/gi) || []).length
    console.log(url, { consistency: n, crazy: c, statusOk: html.length > 500 })
  } catch (e) {
    console.log(url, e.message)
  }
}

const shopPages = await gql(`{
  pages(first: 50) {
    nodes { handle title isPublished templateSuffix }
  }
}`)
const leaguePages = shopPages.pages.nodes.filter((p) =>
  /league/i.test(`${p.handle} ${p.title} ${p.templateSuffix || ''}`)
)
console.log('shop pages with league', leaguePages)

const menus = await gql(`{
  menus(first: 20) {
    nodes { handle title items { title url items { title url } } }
  }
}`)
function walk(items, acc = []) {
  for (const it of items || []) {
    if (/league/i.test(`${it.title} ${it.url}`)) acc.push({ title: it.title, url: it.url })
    if (it.items) walk(it.items, acc)
  }
  return acc
}
for (const m of menus.menus.nodes) {
  const hits = walk(m.items)
  if (hits.length) console.log('menu', m.handle, hits)
}
