import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
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

// Search theme files mentioning talk-to-a-coach or page.contact
const files = [
  'layout/theme.liquid',
  'templates/page.contact.json',
  'templates/page.json',
  'templates/page.talk-to-a-coach.json',
  'config/settings_data.json',
  'sections/header-group.json',
  'sections/footer-group.json',
]

const data = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 20) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId, filenames: files }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content || ''
  const hits = []
  if (content.includes('talk-to-a-coach')) hits.push('talk-to-a-coach')
  if (content.includes('page.contact')) hits.push('page.contact')
  if (content.includes('"contact"')) hits.push('contact')
  console.log(node.filename, { len: content.length, hits })
  if (node.filename.includes('talk-to-a-coach')) {
    console.log(content.slice(0, 400))
  }
}

// Also check URL redirects
const redirects = await gql(`{
  urlRedirects(first: 50, query: "path:talk*") {
    nodes { id path target }
  }
}`)
console.log('redirects', redirects.urlRedirects.nodes)
