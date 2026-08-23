import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
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

const themes = await gql(`{ themes(first: 25) { nodes { id role name } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

// Search theme files for Climb the ladder / lx-league
const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  {
    id: main.id,
    filenames: [
      'sections/lurvox-league.liquid',
      'templates/page.league.json',
      'layout/theme.liquid',
      'sections/main-page.liquid',
      'sections/custom-liquid.liquid',
      'sections/custom-liquid-section.liquid',
    ],
  }
)

for (const n of files.theme.files.nodes) {
  const c = n.body?.content || ''
  console.log(n.filename, {
    exists: !!c,
    hasClimb: c.includes('Climb the ladder'),
    hasBack: c.includes('lx-league__back'),
    hasMarker: c.includes('LX-LEAGUE-BACK-V3'),
    hasLxLeague: c.includes('lx-league'),
  })
}

// List all section filenames containing league
const all = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: []) {
        nodes { filename }
      }
    }
  }`,
  { id: main.id }
).catch(() => null)

// Better: use files with prefix via GraphQL theme files cursor
const listed = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(first: 250) {
        nodes { filename }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`,
  { id: main.id }
)

const names = listed.theme.files.nodes.map((n) => n.filename)
const hits = names.filter((f) => /league|lx-league|consistency/i.test(f))
console.log('theme files matching league', hits)
console.log('total files page1', names.length, 'hasNext', listed.theme.files.pageInfo.hasNextPage)

// Also try Section Rendering API
const sectionUrl =
  'https://www.lurvox.in/pages/consistency-league?sections=lurvox_league&v=' + Date.now()
const sectionRes = await fetch(sectionUrl, {
  headers: { Accept: 'application/json' },
})
const sectionText = await sectionRes.text()
console.log('section API status', sectionRes.status, sectionText.slice(0, 500))
console.log('section has back', sectionText.includes('lx-league__back'), sectionText.includes('LX-LEAGUE-BACK-V3'))

// Try changing a UNIQUE visible string in the title and see if live updates
let league = files.theme.files.nodes.find((n) => n.filename === 'sections/lurvox-league.liquid')
  .body.content

if (!league.includes('Climb the ladder NOW')) {
  league = league.replace('Climb the ladder.', 'Climb the ladder NOW.')
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [{ filename: 'sections/lurvox-league.liquid', body: { type: 'TEXT', value: league } }],
  }
)
console.log('title upsert', upsert.themeFilesUpsert)

await new Promise((r) => setTimeout(r, 4000))
const html = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then((r) =>
  r.text()
)
console.log({
  liveHasNOW: html.includes('Climb the ladder NOW'),
  liveHasOld: html.includes('Climb the ladder.'),
  liveHasBack: html.includes('lx-league__back'),
})
