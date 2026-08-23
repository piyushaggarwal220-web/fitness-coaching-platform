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

// Search all resources
const search = await gql(`{
  pages(first: 20, query: "consistency OR league") { nodes { id handle title templateSuffix } }
  articles(first: 10, query: "consistency OR league") { nodes { id handle title } }
  metaobjects(type: "page", first: 20) { nodes { id handle type } }
}`)
console.log(JSON.stringify(search, null, 2))

// Scan theme files for consistency-league path
let cursor = null
const hits = []
for (let i = 0; i < 15; i++) {
  const data = await gql(
    `query ($id: ID!, $cursor: String) {
      theme(id: $id) {
        files(first: 100, after: $cursor) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { id: THEME_GID, cursor }
  )
  for (const n of data.theme.files.nodes) {
    const c = n.body?.content || ''
    if (/consistency-league|page\.league/.test(c) || /consistency-league/.test(n.filename)) {
      hits.push(n.filename)
    }
  }
  if (!data.theme.files.pageInfo.hasNextPage) break
  cursor = data.theme.files.pageInfo.endCursor
}
console.log('theme hits', hits)

// Force homepage refresh by touching a unique setting in index + verify cta
const indexRes = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
let index = JSON.parse(indexRes.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
index.sections.blocks_C9E4qf.blocks[wygKey].settings.highlight_text =
  'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote'
index.sections.blocks_C9E4qf.blocks[wygKey].settings.cta_url = '/pages/league'
index.sections.blocks_C9E4qf.blocks[wygKey].settings.flat_list = true
index.sections.blocks_C9E4qf.blocks[wygKey].settings.paragraph = ''

// Bust cache with invisible setting change - add a space in eyebrow then correct
index.sections.blocks_C9E4qf.blocks[wygKey].settings.eyebrow_text = 'INCLUDED WITH EVERY PLAN'

await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({ asset: { key: 'templates/index.json', value: JSON.stringify(index, null, 2) } }),
})

// Rename old page.league template so stuck URL can't use it
const oldLeagueTemplate = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/page.league.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

if (oldLeagueTemplate.asset) {
  // Replace page.league.json to also use new section with back button
  const fixed = `{
  "sections": {
    "main": {
      "type": "lurvox-consistency-league",
      "settings": {}
    }
  },
  "order": ["main"]
}
`
  await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key: 'templates/page.league.json', value: fixed } }),
  })
  console.log('rewrote page.league.json to new section')
}

// Delete the old section file content - replace with redirect notice? Better keep and sync
const league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)
await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({
    asset: { key: 'sections/lurvox-league.liquid', value: league },
  }),
})
console.log('synced old section filename too')

await new Promise((r) => setTimeout(r, 5000))

for (const url of [
  'https://www.lurvox.in/pages/league',
  'https://www.lurvox.in/pages/consistency-league?view=league',
  'https://www.lurvox.in/?preview_theme_id=' + THEME_ID,
]) {
  const html = await fetch(url + '&v=' + Date.now().toString().replace(/^/, '?v=').replace('?v=?v=', '?v=') ).catch(() => null)
}

// cleaner fetches
const leagueHtml = await fetch('https://www.lurvox.in/pages/league?v=' + Date.now()).then((r) =>
  r.text()
)
const stuckHtml = await fetch(
  'https://www.lurvox.in/pages/consistency-league?view=league&v=' + Date.now()
).then((r) => r.text())
const stuckDefault = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then(
  (r) => r.text()
)
const homeHtml = await fetch(
  'https://www.lurvox.in/?preview_theme_id=' + THEME_ID + '&v=' + Date.now()
).then((r) => r.text())

console.log({
  league: {
    hasBack: leagueHtml.includes('lx-league__back'),
    template: leagueHtml.match(/data-template="([^"]+)"/)?.[1],
  },
  stuckWithView: {
    hasBack: stuckHtml.includes('lx-league__back'),
    template: stuckHtml.match(/data-template="([^"]+)"/)?.[1],
  },
  stuckDefault: {
    hasBack: stuckDefault.includes('lx-league__back'),
    template: stuckDefault.match(/data-template="([^"]+)"/)?.[1],
    title: stuckDefault.match(/<title>([^<]+)</)?.[1]?.replace(/\s+/g, ' ').trim(),
  },
  homePreview: {
    hasRewardsFirst: homeHtml.includes('REWARDS FIRST'),
    hasDiet: homeHtml.includes('Diet tracker'),
    hasFlat: homeHtml.includes('ai-what-you-get-flat-'),
    ctaLeague: homeHtml.includes('/pages/league'),
    ctaOld: homeHtml.includes('/pages/consistency-league'),
  },
})
