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

const themes = await gql(`{ themes(first: 10) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

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
    filenames: [
      'templates/page.league.json',
      'templates/page.json',
      'sections/lurvox-league.liquid',
      'sections/lurvox-page-content.liquid',
    ],
  }
)
for (const n of files.theme.files.nodes) {
  const c = n.body?.content || ''
  console.log('\n====', n.filename, 'len', c.length)
  console.log(c.slice(0, 300))
}

const pages = await gql(`{
  pages(first: 100) {
    nodes { id handle title templateSuffix }
  }
}`)
const league = pages.pages.nodes.find((p) => p.handle === 'consistency-league')
console.log('\nPAGE', league)

const html = await fetch('https://www.lurvox.in/pages/consistency-league', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
console.log('\nHTML has lx-league', html.includes('lx-league'))
console.log('HTML has lurvox_page_content', html.includes('lurvox_page_content'))
console.log('HTML has section-lurvox-league', html.includes('section-lurvox-league'))
