import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const mainId = 161429127419

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${mainId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await res.text()
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    return null
  }
}

const index = await get('templates/index.json')
console.log('index has 2699', /2,?699/.test(index))
console.log('index has compare-inline', /plan-compare-inline|lx-matrix/.test(index))
const renders = [...index.matchAll(/plan-compare[^\"]*|lurvox-plan-compare[^\"]*|lx-matrix[^\"]*/g)].map(
  (m) => m[0]
)
console.log('renders', [...new Set(renders)].slice(0, 20))

// Find which files render the matrix
for (const key of [
  'layout/theme.liquid',
  'snippets/lurvox-conversion-boost.liquid',
  'sections/lurvox-tap-plan-force.liquid',
  'snippets/lurvox-tap-plan-force.liquid',
]) {
  const val = await get(key)
  if (!val) {
    console.log(key, 'missing')
    continue
  }
  console.log(
    key,
    'inline?',
    /plan-compare-inline|2,?699|lx-matrix/.test(val),
    (val.match(/render ['\"][^'\"]+['\"]/g) || []).filter((r) => /plan|compare|close|conv|matrix/i.test(r))
  )
}

// Duplicate publish: copy corrected assets onto Offer live too, then publish main again via GraphQL
const offerId = 161391804667
const assetsToCopy = [
  'snippets/lurvox-plan-compare-inline.liquid',
  'snippets/lurvox-sales-closer.liquid',
  'snippets/lurvox-conversion-boost.liquid',
  'sections/lurvox-ad-landing.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'templates/index.json',
]

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(json).slice(0, 200)}`)
  console.log('copied', themeId, key)
}

for (const key of assetsToCopy) {
  const val = await get(key)
  if (!val) {
    console.log('skip missing on main', key)
    continue
  }
  await put(offerId, key, val)
}

// Publish main theme explicitly
const gql = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themePublish($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { field message }
      }
    }`,
    variables: { id: `gid://shopify/OnlineStoreTheme/${mainId}` },
  }),
})
console.log('publish', JSON.stringify(await gql.json(), null, 2))

const html = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()
const matrix = (html.match(/lx-matrix__table[\s\S]{0,450}/) || [''])[0].replace(/\s+/g, ' ')
console.log('matrix', matrix.slice(0, 360))
console.log({
  hasOld2699: /₹\s*2,?699/.test(html),
  has999: /₹\s*999/.test(html),
  has2999: /₹\s*2,?999/.test(html),
})
