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

for (const filename of [
  'sections/footer-group.json',
  'sections/mobile-floating-bar.liquid',
  'sections/header-group.json',
]) {
  const data = await gql(
    `query ($id: ID!, $filenames: [String!]!) {
      theme(id: $id) {
        files(filenames: $filenames, first: 1) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: themeId, filenames: [filename] }
  )
  const content = data.theme.files.nodes[0]?.body?.content || ''
  console.log(filename, {
    talkCoach: (content.match(/\/pages\/talk-coach/g) || []).length,
    talkToACoach: (content.match(/\/pages\/talk-to-a-coach/g) || []).length,
    redirect: content.includes('lurvox-talk-path-redirect-v1'),
  })
}
