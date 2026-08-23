/**
 * Fetch MAIN header-group + related section liquid for redesign baseline.
 * Never prints the access token.
 */
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

const themes = await gql(`{ themes(first: 25) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN')

const data = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      name
      role
      files(filenames: [
        "sections/header-group.json",
        "sections/lurvox-client-login.liquid",
        "sections/header.liquid"
      ]) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: main.id }
)

const outDir = path.join('scripts', 'tmp-header-baseline')
fs.mkdirSync(outDir, { recursive: true })
const summary = { mainId: main.id, mainName: main.name, files: {} }

for (const node of data.theme.files.nodes) {
  const content = node.body?.content || ''
  const safe = node.filename.replaceAll('/', '__')
  fs.writeFileSync(path.join(outDir, safe), content)
  summary.files[node.filename] = { len: content.length, saved: safe }
}

fs.writeFileSync(path.join(outDir, '_summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
