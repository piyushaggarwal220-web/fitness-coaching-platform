import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'
const PAGE_ID = 'gid://shopify/Page/134114214139'

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
  if (json.errors || json.asset?.errors) {
    throw new Error(JSON.stringify(json.errors || json.asset.errors))
  }
  return json.asset
}

const league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)

const template = `{
  "sections": {
    "main": {
      "type": "lurvox-consistency-league",
      "settings": {}
    }
  },
  "order": ["main"]
}
`

console.log(
  'put section',
  (await putAsset('sections/lurvox-consistency-league.liquid', league)).updated_at
)
console.log(
  'put page.consistency-league.json',
  (await putAsset('templates/page.consistency-league.json', template)).updated_at
)

const updated = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix title }
      userErrors { field message }
    }
  }`,
  {
    id: PAGE_ID,
    page: { templateSuffix: 'consistency-league' },
  }
)
console.log('pageUpdate', JSON.stringify(updated.pageUpdate, null, 2))

await new Promise((r) => setTimeout(r, 4000))

for (const url of [
  'https://www.lurvox.in/pages/consistency-league?v=' + Date.now(),
  'https://9uwyq1-0j.myshopify.com/pages/consistency-league?v=' + Date.now(),
]) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
  const html = await res.text()
  console.log({
    url: res.url,
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    bodyClass: html.match(/<body[^>]*class="([^"]*)"/)?.[1],
    sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
    hasBack: html.includes('lx-league__back'),
    hasGoBack: html.includes('Go back'),
    hero: (() => {
      const i = html.indexOf('lx-league__hero')
      return i < 0 ? null : html.slice(i, i + 260)
    })(),
  })
}
