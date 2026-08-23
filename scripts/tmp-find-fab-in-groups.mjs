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
      files(filenames: ["sections/footer-group.json", "sections/header-group.json", "layout/theme.liquid"], first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId }
)

for (const node of data.theme.files.nodes) {
  const c = node.body?.content || ''
  console.log(node.filename, {
    fab: c.includes('lurvox-fab') || c.includes('mobile-floating'),
    floatingBarType: c.includes('mobile-floating-bar'),
    talkCoach: (c.match(/talk-coach/g) || []).length,
  })
  if (node.filename.includes('footer')) {
    const i = c.indexOf('mobile-floating')
    console.log('footer floating context', c.slice(Math.max(0, i - 50), i + 200))
  }
}
