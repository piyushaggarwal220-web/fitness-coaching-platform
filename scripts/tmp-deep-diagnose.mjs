import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = '161086767355'

console.log('--- 1. read back assets (REST) ---')
const listing = await fetch(
  `${REST}/themes/${THEME}/assets.json`,
  { headers }
).then((r) => r.json())
for (const key of ['templates/index.json', 'layout/theme.liquid', 'blocks/ai_gen_block_361650c.liquid', 'sections/mobile-floating-bar.liquid']) {
  const meta = listing.assets.find((a) => a.key === key)
  console.log(key, 'updated_at:', meta?.updated_at, 'size:', meta?.size)
}

console.log('\n--- 2. read back via GraphQL themeFiles ---')
const gql = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `query($id: ID!) {
      theme(id: $id) {
        id
        name
        role
        files(filenames: ["templates/index.json", "layout/theme.liquid"], first: 5) {
          nodes { filename size checksumMd5 updatedAt body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    variables: { id: `gid://shopify/OnlineStoreTheme/${THEME}` },
  }),
}).then((r) => r.json())
if (gql.errors) console.log(JSON.stringify(gql.errors))
for (const node of gql.data?.theme?.files?.nodes ?? []) {
  const content = node.body?.content ?? ''
  console.log(node.filename, node.updatedAt, 'len', content.length,
    'hasNewLabel:', content.includes('GET THE 12-MONTH PLAN'),
    'hasTalkCss:', content.includes('lurvox-talk-cta-highlight'))
}

console.log('\n--- 3. themes with role main (GraphQL) ---')
const themesGql = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query: `{ themes(first: 25) { nodes { id name role updatedAt } } }` }),
}).then((r) => r.json())
for (const t of themesGql.data?.themes?.nodes ?? []) {
  console.log(t.id, t.role, t.updatedAt, t.name)
}

console.log('\n--- 4. shop / primary domain ---')
const shop = await fetch(`${REST}/shop.json`, { headers }).then((r) => r.json())
console.log({
  name: shop.shop?.name,
  domain: shop.shop?.domain,
  myshopify: shop.shop?.myshopify_domain,
  plan: shop.shop?.plan_name,
})
