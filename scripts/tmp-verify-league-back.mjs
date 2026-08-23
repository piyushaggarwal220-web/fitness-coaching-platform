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
  return (await res.json()).data
}

const themes = await gql(`{ themes(first: 25) { nodes { id role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id, filenames: ['sections/lurvox-league.liquid'] }
)
const c = files.theme.files.nodes[0].body.content
console.log('theme back', c.includes('lx-league__back'), c.includes('Go back'))

const html = await fetch(`https://www.lurvox.in/pages/consistency-league?v=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
console.log('html back', html.includes('lx-league__back'), html.includes('Go back'))
console.log('html lx-league', html.includes('lx-league'))
