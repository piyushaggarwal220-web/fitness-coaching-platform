/**
 * Fetch What-you-get block schema + page templates from MAIN theme.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

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

const themes = await gql(`{ themes(first: 15) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main.name, main.id)

const filenames = [
  'blocks/ai_gen_block_68d702b.liquid',
  'templates/page.json',
  'templates/index.json',
]

const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: main.id, filenames }
)

for (const n of files.theme.files.nodes) {
  const c = n.body?.content || ''
  const out = path.join('scripts', `tmp-fetch-${n.filename.replace(/[\\/]/g, '-')}`)
  fs.writeFileSync(out, c)
  console.log(n.filename, '→', out, 'len', c.length)
}

// List pages that mention league
const pages = await gql(`{
  pages(first: 50) {
    nodes { id handle title templateSuffix }
  }
}`)
console.log('pages', pages.pages.nodes.map((p) => `${p.handle}|${p.templateSuffix || ''}|${p.title}`).join('\n'))
