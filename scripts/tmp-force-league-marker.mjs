import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const MARKER = '<!-- LX-LEAGUE-BACK-V3 -->'

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

const themes = await gql(`{ themes(first: 25) { nodes { id role name } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

let league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)

// Ensure back button + unique marker right after hero open
if (!league.includes('lx-league__back')) {
  league = league.replace(
    '<header class="lx-league__hero">',
    `<header class="lx-league__hero">\n    ${MARKER}\n    <a class="lx-league__back" href="{{ routes.root_url }}">← Go back</a>`
  )
} else {
  league = league.replace(
    '<header class="lx-league__hero">\n    <a class="lx-league__back"',
    `<header class="lx-league__hero">\n    ${MARKER}\n    <a class="lx-league__back"`
  )
}

// Also write marker into local asset
fs.writeFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  league
)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`,
  {
    themeId: main.id,
    files: [
      {
        filename: 'sections/lurvox-league.liquid',
        body: { type: 'TEXT', value: league },
      },
    ],
  }
)
console.log('upsert', JSON.stringify(upsert.themeFilesUpsert, null, 2))

// Read back checksum-ish
const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes {
          filename
          size
          updatedAt
          checksumMd5
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: main.id, filenames: ['sections/lurvox-league.liquid'] }
)
const node = files.theme.files.nodes[0]
console.log({
  updatedAt: node.updatedAt,
  size: node.size,
  checksumMd5: node.checksumMd5,
  hasMarker: node.body.content.includes('LX-LEAGUE-BACK-V3'),
  hasBack: node.body.content.includes('lx-league__back'),
})

// Wait a moment then fetch myshopify + custom domain
await new Promise((r) => setTimeout(r, 3000))

for (const base of [
  'https://9uwyq1-0j.myshopify.com/pages/consistency-league',
  'https://www.lurvox.in/pages/consistency-league',
]) {
  const url = `${base}?v=${Date.now()}`
  const res = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; LURVOX-check/1.0)',
    },
  })
  const html = await res.text()
  const i = html.indexOf('lx-league__hero')
  console.log({
    url: res.url,
    status: res.status,
    hasMarker: html.includes('LX-LEAGUE-BACK-V3'),
    hasBack: html.includes('lx-league__back'),
    hasGoBack: html.includes('Go back'),
    shop: html.match(/Shopify\.shop\s*=\s*"([^"]+)"/)?.[1],
    themeId: html.match(/themeId":"(\d+)/)?.[1],
    themeStoreId: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
    hero: i < 0 ? null : html.slice(i, i + 350),
  })
}
