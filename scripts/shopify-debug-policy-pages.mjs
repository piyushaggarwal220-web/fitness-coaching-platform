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

const pages = await gql(`{
  pages(first: 50) {
    nodes { id handle title body templateSuffix }
  }
}`)

for (const p of pages.pages.nodes) {
  const plain = (p.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log(
    `\n${p.handle} | templateSuffix=${p.templateSuffix || '(default)'} | bodyLen=${(p.body || '').length}`
  )
  console.log(plain.slice(0, 180) || '(empty body)')
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const files = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.json", "templates/page.contact.json", "templates/page.plans.json"]) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id }
)
for (const n of files.theme.files.nodes) {
  console.log('\nFILE', n.filename, 'len', n.body?.content?.length || 0)
  console.log((n.body?.content || '').slice(0, 500))
}

// list page templates
const list = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: []) { nodes { filename } }
    }
  }`,
  { id: main.id }
).catch(() => null)
