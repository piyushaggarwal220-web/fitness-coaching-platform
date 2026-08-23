import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role updatedAt } } }`)
console.log(
  JSON.stringify(
    themes.data?.themes?.nodes?.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
    })),
    null,
    2
  )
)

const pages = await gql(`{
  pages(first: 30, query: "handle:talk*") {
    nodes { id title handle templateSuffix }
  }
}`)
console.log('pages', JSON.stringify(pages.data?.pages?.nodes, null, 2))

const draft = themes.data?.themes?.nodes?.find((t) =>
  t.name.toLowerCase().includes('copy of copy of lurvox price review')
)
if (draft) {
  const numeric = draft.id.match(/OnlineStoreTheme\/(\d+)/)?.[1]
  console.log('DRAFT', numeric, draft.name, draft.role)
  const footer = await fetch(
    `${REST}/themes/${numeric}/assets.json?asset[key]=${encodeURIComponent('sections/footer-group.json')}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  const val = footer.asset?.value || ''
  const consult = [...val.matchAll(/consultation_url"\s*:\s*"([^"]*)"/g)].map((m) => m[1])
  console.log('footer consult urls', consult)
}
