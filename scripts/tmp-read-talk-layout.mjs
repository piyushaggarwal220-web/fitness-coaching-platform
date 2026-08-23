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

const data = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {
    id: themeId,
    filenames: ['layout/theme.liquid', 'templates/page.talk-to-a-coach.json', 'templates/page.contact.json'],
  }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content || ''
  if (node.filename === 'layout/theme.liquid') {
    let from = 0
    while (true) {
      const i = content.toLowerCase().indexOf('talk-to-a-coach', from)
      if (i < 0) break
      console.log('\n--- layout hit @', i, '---')
      console.log(content.slice(Math.max(0, i - 250), i + 350))
      from = i + 1
    }
  } else {
    console.log('\n===', node.filename, '===')
    console.log(content)
  }
}
