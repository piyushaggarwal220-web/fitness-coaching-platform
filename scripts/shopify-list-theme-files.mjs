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

const files = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      id
      name
      files(filenames: [
        "config/settings_data.json",
        "templates/index.json",
        "sections/header-group.json",
        "sections/footer-group.json"
      ], first: 20) {
        nodes { filename size }
      }
    }
  }`,
  { id: THEME_ID }
)

console.log(JSON.stringify(files, null, 2))
