import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161086767355'

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

let cursor = null
const indexFiles = []
for (let i = 0; i < 20; i++) {
  const data = await gql(
    `query ($id: ID!, $cursor: String) {
      theme(id: $id) {
        files(first: 100, after: $cursor) {
          nodes { filename }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { id: THEME_GID, cursor }
  )
  for (const n of data.theme.files.nodes) {
    if (/index|68d702b|what-you-get|league/i.test(n.filename)) {
      indexFiles.push(n.filename)
    }
  }
  if (!data.theme.files.pageInfo.hasNextPage) break
  cursor = data.theme.files.pageInfo.endCursor
}
console.log(indexFiles.sort().join('\n'))

// Read current index highlight from asset again after put
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const indexAsset = await fetch(
  `${REST}/themes/161086767355/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const idx = indexAsset.asset.value
console.log({
  updated_at: indexAsset.asset.updated_at,
  hasSeeCta: idx.includes('See the Consistency League'),
  hasRewardsFirst: idx.includes('REWARDS FIRST'),
  hasPagesLeague: idx.includes('/pages/league'),
  hasOldPath: idx.includes('/pages/consistency-league'),
})
