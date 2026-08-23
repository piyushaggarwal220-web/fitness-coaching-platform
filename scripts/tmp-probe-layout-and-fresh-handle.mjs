import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'
const MARKER = '<!-- LX-LAYOUT-PROBE-V1 -->'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  const json = await res.json()
  return json.asset
}

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
  return json.asset
}

const asset = await getAsset('layout/theme.liquid')
let liquid = asset.value
if (!liquid.includes('LX-LAYOUT-PROBE-V1')) {
  liquid = liquid.replace('<body', `${MARKER}\n<body`)
  console.log('put layout', (await putAsset('layout/theme.liquid', liquid)).updated_at)
} else {
  console.log('probe already present in layout asset')
}

await new Promise((r) => setTimeout(r, 3000))

const html = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then(
  (r) => r.text()
)
const home = await fetch('https://www.lurvox.in/?v=' + Date.now()).then((r) => r.text())
console.log({
  leagueHasProbe: html.includes('LX-LAYOUT-PROBE-V1'),
  homeHasProbe: home.includes('LX-LAYOUT-PROBE-V1'),
  leagueTemplate: html.match(/data-template="([^"]+)"/)?.[1],
})

// Also create a fresh handle URL that should not be stuck
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
      handle: 'league',
      templateSuffix: 'consistency-league',
      body: '<div style="display:none">Consistency League</div>',
      isPublished: true,
    },
  }
)
console.log('create /pages/league', JSON.stringify(create.pageCreate, null, 2))

await new Promise((r) => setTimeout(r, 3000))
const leaguePage = await fetch('https://www.lurvox.in/pages/league?v=' + Date.now()).then((r) =>
  r.text()
)
console.log({
  leagueUrl: {
    status: leaguePage.includes('404') && leaguePage.includes('Not Found') ? 404 : 200,
    dataTemplate: leaguePage.match(/data-template="([^"]+)"/)?.[1],
    hasBack: leaguePage.includes('lx-league__back'),
    sectionIds: [...leaguePage.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map(
      (m) => m[1]
    ),
  },
})
