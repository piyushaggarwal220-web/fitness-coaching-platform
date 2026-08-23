import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const themeId = 'gid://shopify/OnlineStoreTheme/161112981755'

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

const data = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["layout/theme.liquid"], first: 1) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId }
)
const layout = data.theme.files.nodes[0]?.body?.content || ''
console.log('has marker', layout.includes('lurvox-talk-form-override-v1'))
console.log('has section tag', layout.includes("section 'lurvox-talk-to-coach'"))
const i = layout.indexOf('lurvox-talk-form-override')
console.log(layout.slice(Math.max(0, i - 80), i + 500))
console.log('near body', layout.includes('</body>'), layout.lastIndexOf('</body>'))
