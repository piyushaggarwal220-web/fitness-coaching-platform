import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

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

// Remove redirects for consistency-league
const redirects = await fetch(`${REST}/redirects.json?limit=250`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
for (const r of redirects.redirects || []) {
  if (r.path === '/pages/consistency-league' || r.path === '/pages/league') {
    await fetch(`${REST}/redirects/${r.id}.json`, {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token.access_token },
    })
    console.log('deleted redirect', r.path, '->', r.target)
  }
}

// Create page at consistency-league with working template
const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Consistency League',
      handle: 'consistency-league',
      templateSuffix: 'consistency-league',
      body: '<div style="display:none">Consistency League</div>',
      isPublished: true,
    },
  }
)
console.log('create', JSON.stringify(create.pageCreate, null, 2))

// Point homepage CTA to original URL as absolute
const THEME_ID = '161086767355'
const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const index = JSON.parse(indexAsset.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
index.sections.blocks_C9E4qf.blocks[wygKey].settings.cta_url =
  'https://www.lurvox.in/pages/consistency-league'
index.sections.blocks_C9E4qf.blocks[wygKey].settings.cta_label =
  'See the Consistency League →'

await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({
    asset: { key: 'templates/index.json', value: JSON.stringify(index, null, 2) },
  }),
})
console.log('cta pointed at consistency-league')

await new Promise((r) => setTimeout(r, 5000))

for (const url of [
  'https://www.lurvox.in/pages/consistency-league',
  'https://www.lurvox.in/pages/league',
]) {
  const html = await fetch(url + '?v=' + Date.now()).then((r) => r.text())
  console.log({
    url,
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    section: html.match(/shopify-section-template--\d+__([\w-]+)/)?.[1],
  })
}
