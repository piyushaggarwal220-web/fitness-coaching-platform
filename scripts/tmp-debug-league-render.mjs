import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const themes = await gql(`{ themes(first: 25) { nodes { id role name } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

const pages = await gql(`{
  pages(first: 20, query: "title:Consistency OR handle:consistency*") {
    nodes { id handle title templateSuffix body bodySummary }
  }
}`)
console.log('pages', JSON.stringify(pages.pages.nodes, null, 2))

const allPages = await gql(`{
  pages(first: 50) {
    nodes { id handle title templateSuffix }
  }
}`)
const leagueish = allPages.pages.nodes.filter(
  (p) =>
    /league|consist/i.test(p.handle) ||
    /league|consist/i.test(p.title || '')
)
console.log('leagueish', leagueish)

const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {
    id: main.id,
    filenames: ['templates/page.league.json', 'sections/lurvox-league.liquid'],
  }
)

for (const n of files.theme.files.nodes) {
  console.log('\n====', n.filename, '====')
  console.log(n.body.content.slice(0, 800))
}

// Fetch live with response headers
const res = await fetch(
  'https://www.lurvox.in/pages/consistency-league?preview_theme_id=' +
    main.id.split('/').pop() +
    '&v=' +
    Date.now(),
  { headers: { 'Cache-Control': 'no-cache' }, redirect: 'follow' }
)
console.log('\nstatus', res.status, res.url)
console.log('headers', {
  'x-shopify-stage': res.headers.get('x-shopify-stage'),
  'x-shopid': res.headers.get('x-shopid'),
  'link': res.headers.get('link'),
  'cache-control': res.headers.get('cache-control'),
  'x-cache': res.headers.get('x-cache'),
  'cf-cache-status': res.headers.get('cf-cache-status'),
})
const html = await res.text()
const i = html.indexOf('lx-league__hero')
console.log('hero', html.slice(i, i + 400))
console.log('has back', html.includes('lx-league__back'), html.includes('Go back'))
console.log('theme id in html?', html.includes('161086767355'), html.match(/theme[_-]?id["'=:\s]+(\d+)/i)?.[0])
