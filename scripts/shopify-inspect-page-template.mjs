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

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const files = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.json"]) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id }
)

const raw = files.theme.files.nodes[0].body.content.replace(/^\/\*[\s\S]*?\*\//, '').trim()
fs.writeFileSync('scripts/tmp-page-template.json', raw)
const j = JSON.parse(raw)
console.log('order', j.order)
console.log('sections', Object.keys(j.sections))
for (const [id, s] of Object.entries(j.sections)) {
  console.log(
    id,
    'type=' + s.type,
    'blocks=' + Object.keys(s.blocks || {}).length,
    'name=' + (s.name || '')
  )
}
console.log('\n--- full ---')
console.log(JSON.stringify(j, null, 2))
