import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const THEME_ID = 'gid://shopify/OnlineStoreTheme/160888094971'

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
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const data = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/index.json", "sections/header-group.json", "config/settings_data.json"], first: 10) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText { content }
          }
        }
      }
    }
  }`,
  { id: THEME_ID }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  const out = `C:/Users/DELL/coaching-platform/scripts/tmp-theme-${node.filename.replaceAll('/', '-')}`
  fs.writeFileSync(out, content)
  console.log('wrote', out, 'bytes', content.length)
  // Print URL-like strings
  const urls = [...content.matchAll(/https?:\\?\/\\?\/[^\s"'\\]{5,200}/g)].map((m) =>
    m[0].replace(/\\\//g, '/')
  )
  const unique = [...new Set(urls)]
  console.log('urls in', node.filename, unique.slice(0, 40))
}
