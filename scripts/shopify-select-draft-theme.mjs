import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`

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

const data = await gql(`{
  themes(first: 20) {
    nodes { id name role }
  }
}`)

console.log(JSON.stringify(data.themes.nodes, null, 2))

const target = data.themes.nodes.find(
  (t) => t.name.trim().toLowerCase() === 'copy of copy of copy of horizon'
)

if (!target) {
  console.error('TARGET_NOT_FOUND')
  process.exit(1)
}

fs.writeFileSync(
  process.env.TEMP + '/shopify-draft-theme.json',
  JSON.stringify(
    {
      draftThemeId: target.id,
      draftThemeName: target.name,
      role: target.role,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  )
)

console.log('SELECTED', target.id, target.name, target.role)
