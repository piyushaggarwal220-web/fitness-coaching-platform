import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const SHOP = '9uwyq1-0j.myshopify.com'
const THEME_ID = '161086767355'
const API = `https://${SHOP}/admin/api/2025-01/graphql.json`
const REST = `https://${SHOP}/admin/api/2025-01`

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

// REST asset fetch
const restRes = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=sections/lurvox-league.liquid`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
)
const restJson = await restRes.json()
const restValue = restJson.asset?.value || ''
console.log('REST asset', {
  status: restRes.status,
  updated_at: restJson.asset?.updated_at,
  size: restValue.length,
  hasNOW: restValue.includes('Climb the ladder NOW'),
  hasBack: restValue.includes('lx-league__back'),
  hasMarker: restValue.includes('LX-LEAGUE-BACK-V3'),
  hero: restValue.slice(restValue.indexOf('lx-league__hero'), restValue.indexOf('lx-league__hero') + 280),
})

// Live HTML structure around section
const html = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then((r) =>
  r.text()
)

const sectionIdx = html.indexOf('shopify-section')
const leagueIdx = html.indexOf('lx-league')
console.log({
  sectionClassHits: (html.match(/shopify-section[^"'\s]*/g) || []).slice(0, 20),
  hasSectionLurvox: html.includes('section-lurvox-league'),
  hasIdConsistency: html.includes('id="consistency-league"'),
  templateHint: html.match(/template\s*[:=]\s*["']([^"']+)/i)?.[1],
  pageTemplate: html.match(/page\.([\w-]+)/)?.[0],
  dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
  bodyClass: html.match(/<body[^>]*class="([^"]*)"/)?.[1],
})

// Extract full section HTML chunk
const start = html.indexOf('id="consistency-league"')
console.log('consistency-league idx', start)
if (start > 0) {
  console.log(html.slice(start - 200, start + 500))
}

// Find shopify-section that contains lx-league
const lx = html.indexOf('class="lx-league"')
console.log('lx-league class idx', lx)
console.log(html.slice(Math.max(0, lx - 300), lx + 200))

// Check if content might be from a static asset / app
console.log({
  hasAppBlock: html.includes('shopify-block'),
  scriptSources: [...html.matchAll(/src="([^"]*lurvox[^"]*)"/gi)].map((m) => m[1]).slice(0, 10),
})

// Paginate theme files looking for lurvox-league
let cursor = null
let found = []
for (let i = 0; i < 10; i++) {
  const data = await gql(
    `query ($id: ID!, $cursor: String) {
      theme(id: $id) {
        files(first: 250, after: $cursor) {
          nodes { filename }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { id: `gid://shopify/OnlineStoreTheme/${THEME_ID}`, cursor }
  )
  const nodes = data.theme.files.nodes
  found.push(...nodes.filter((n) => /lurvox|league/i.test(n.filename)).map((n) => n.filename))
  if (!data.theme.files.pageInfo.hasNextPage) break
  cursor = data.theme.files.pageInfo.endCursor
}
console.log('found lurvox/league files across pages', found)
