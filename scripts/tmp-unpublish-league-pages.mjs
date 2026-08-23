import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = 161454620923

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const listed = await gql(`{
  pages(first: 50) {
    nodes { id handle title isPublished templateSuffix }
  }
}`)
const leaguePages = listed.pages.nodes.filter((p) =>
  /league/i.test(`${p.handle} ${p.title}`)
)
for (const page of leaguePages) {
  const update = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { handle isPublished }
        userErrors { field message }
      }
    }`,
    {
      id: page.id,
      page: { isPublished: false },
    }
  )
  console.log('unpublish', page.handle, update.pageUpdate)
}

for (const pathName of ['/pages/consistency-league', '/pages/league', '/pages/consistency-league-redirect-source']) {
  const created = await gql(
    `mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $urlRedirect) {
        urlRedirect { id path target }
        userErrors { field message }
      }
    }`,
    { urlRedirect: { path: pathName, target: '/' } }
  )
  console.log('redirect', pathName, created.urlRedirectCreate)
}

const layoutRes = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await layoutRes.json()).asset.value
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const conv = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
const ad = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'),
  'utf8'
)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
    files: [
      { filename: 'snippets/lurvox-conversion-boost.liquid', body: { type: 'TEXT', value: conv } },
      { filename: 'sections/lurvox-ad-landing.liquid', body: { type: 'TEXT', value: ad } },
      { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
    ],
  }
)
console.log(JSON.stringify(upsert.themeFilesUpsert, null, 2))
console.log('stamp', stamp)
