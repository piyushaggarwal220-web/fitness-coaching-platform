/**
 * Delete the ghost theme id still served by sticky / page_cache,
 * so Shopify must fall back to current MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const GHOST = 'gid://shopify/OnlineStoreTheme/161294057723'
const MAIN = 'gid://shopify/OnlineStoreTheme/161389281531'

// Ensure MAIN is published
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: MAIN }
)

console.log('Deleting ghost theme', GHOST)
const del = await gql(
  `mutation($id: ID!) {
    themeDelete(id: $id) {
      deletedThemeId
      userErrors { message }
    }
  }`,
  { id: GHOST }
)
console.log(JSON.stringify(del, null, 2))

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    tNum: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
    hasForce: html.includes('lurvoxTapWired'),
    hasGoToPlan: html.includes('goToPlan'),
    hasCta: /data-cta-button/.test(html),
    hasStartTransform: /START YOUR TRANSFORMATION/i.test(html),
  }
}

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?del=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (p.themeId === '161389281531' && (p.hasForce || p.hasGoToPlan)) {
    console.log('ROOT FIXED')
    process.exit(0)
  }
}
process.exit(1)
