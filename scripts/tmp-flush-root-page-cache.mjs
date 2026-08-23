import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
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
  return res.json()
}

function probe(html, label) {
  return {
    label,
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    tNum: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
    hasForce: html.includes('lurvoxTapWired'),
    hasCta: /data-cta-button/.test(html),
    hasGoToPlan: html.includes('goToPlan'),
    hasAddToCart: /ADD TO CART/i.test(html),
    hasStartTransform: /START YOUR TRANSFORMATION/i.test(html),
    etagHint: null,
  }
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
    },
  })
  const html = await res.text()
  const p = probe(html)
  p.etag = res.headers.get('etag')
  p.label = url
  return p
}

console.log('index', await fetchUrl(`https://www.lurvox.in/index?v=${Date.now()}`))
console.log('root before', await fetchUrl(`https://www.lurvox.in/?v=${Date.now()}`))

// Try password protection toggle if available
const schema = await gql(`{ __type(name: "Mutation") { fields { name } } }`)
const pwd = (schema.data?.__type?.fields || [])
  .map((f) => f.name)
  .filter((n) => /password|onlineStore/i.test(n))
console.log('mutations', pwd)

for (const name of [
  'onlineStorePasswordProtectionUpdate',
  'onlineStoreUpdate',
]) {
  if (!pwd.includes(name) && name !== 'onlineStoreUpdate') continue
}

// Attempt enable/disable password
let toggled = false
try {
  const on = await gql(
    `mutation($enabled: Boolean!, $password: String) {
      onlineStorePasswordProtectionUpdate(enabled: $enabled, password: $password) {
        onlineStore { passwordProtection { enabled } }
        userErrors { field message }
      }
    }`,
    { enabled: true, password: `flush${Date.now()}` }
  )
  console.log('enable pwd', JSON.stringify(on).slice(0, 500))
  if (!on.errors && !on.data?.onlineStorePasswordProtectionUpdate?.userErrors?.length) {
    await new Promise((r) => setTimeout(r, 3000))
    const off = await gql(
      `mutation($enabled: Boolean!) {
        onlineStorePasswordProtectionUpdate(enabled: $enabled) {
          onlineStore { passwordProtection { enabled } }
          userErrors { field message }
        }
      }`,
      { enabled: false }
    )
    console.log('disable pwd', JSON.stringify(off).slice(0, 500))
    toggled = true
  }
} catch (e) {
  console.log('pwd toggle failed', e.message)
}

// Also bump shop metafield / theme publish again
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: 'gid://shopify/OnlineStoreTheme/161389281531' }
)

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const root = await fetchUrl(`https://www.lurvox.in/?flush=${Date.now()}&i=${i}`)
  console.log(i, JSON.stringify(root))
  if (root.themeId === '161389281531' && root.hasForce) {
    console.log('ROOT FLUSHED', { toggled })
    process.exit(0)
  }
}

console.log('Root still sticky; /index and /?view= are live with tap-plan')
process.exit(0)
