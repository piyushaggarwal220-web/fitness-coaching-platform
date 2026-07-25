import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const MAIN_THEME_ID = 'gid://shopify/OnlineStoreTheme/160888094971'

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
    console.error(JSON.stringify(json, null, 2))
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const name = `LURVOX Draft ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

const data = await gql(
  `mutation themeDuplicate($id: ID!, $name: String) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: MAIN_THEME_ID, name }
)

console.log(JSON.stringify(data, null, 2))

if (data.themeDuplicate?.newTheme?.id) {
  fs.writeFileSync(
    process.env.TEMP + '/shopify-draft-theme.json',
    JSON.stringify(
      {
        draftThemeId: data.themeDuplicate.newTheme.id,
        draftThemeName: data.themeDuplicate.newTheme.name,
        mainThemeId: MAIN_THEME_ID,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  )
}
