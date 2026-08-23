import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'
const THEME_GID = `gid://shopify/OnlineStoreTheme/${THEME_ID}`

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

async function restAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  const json = await res.json()
  return json.asset
}

const template = await restAsset('templates/page.league.json')
const newSection = await restAsset('sections/lurvox-consistency-league.liquid')
const oldSection = await restAsset('sections/lurvox-league.liquid')
const index = await restAsset('templates/index.json')

console.log('page.league.json', template?.value)
console.log('new section exists', !!newSection?.value, 'hasBack', newSection?.value?.includes('lx-league__back'))
console.log('old section hasBack', oldSection?.value?.includes('lx-league__back'))

const idx = index?.value || ''
console.log('index flat_list', idx.includes('"flat_list": true') || idx.includes('"flat_list":true'))
console.log('index highlight', (idx.match(/"highlight_text":\s*"([^"]*)"/) || [])[1]?.slice(0, 80))

// Put PUT via REST for template + section to be sure
const league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)
const pageTemplate = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'templates-page.league.json'),
  'utf8'
)

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return { key, updated_at: json.asset?.updated_at, size: json.asset?.size }
}

console.log('REST put new section', await putAsset('sections/lurvox-consistency-league.liquid', league))
console.log('REST put template', await putAsset('templates/page.league.json', pageTemplate))

// Also try publishing theme (already MAIN)
const pub = await gql(
  `mutation themePublish($id: ID!) {
    themePublish(id: $id) {
      theme { id role name }
      userErrors { field message }
    }
  }`,
  { id: THEME_GID }
)
console.log('publish', JSON.stringify(pub.themePublish, null, 2))

// Wait and poll
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const html = await fetch(
    'https://www.lurvox.in/pages/consistency-league?nocache=' + Date.now(),
    { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
  ).then((r) => r.text())
  const result = {
    attempt: i + 1,
    newSectionId: html.includes('lurvox_consistency_league'),
    oldSectionId: html.includes('__lurvox_league"') || html.includes('__lurvox_league '),
    hasBack: html.includes('lx-league__back'),
    sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
  }
  console.log(result)
  if (result.hasBack) break
}
