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
      'templates/index.json',
      'blocks/ai_gen_block_68d702b.liquid',
      'templates/page.league.json',
      'sections/lurvox-league.liquid',
    ],
  }
)

for (const n of files.theme.files.nodes) {
  const c = n.body?.content || ''
  console.log(
    JSON.stringify(
      {
        file: n.filename,
        len: c.length,
        hasBack: c.includes('lx-league__back') || c.includes('Go back'),
        flat_list: c.includes('"flat_list": true') || c.includes('flat_list'),
        flatClass: c.includes('ai-what-you-get-flat'),
        highlight: c.includes('REWARDS FIRST') || c.includes('highlight_text'),
        dietTracker: c.includes('Diet tracker'),
        paragraphBlank: c.includes('"paragraph": ""') || c.includes('"paragraph":""'),
        realCoaching: c.includes('REAL COACHING'),
      },
      null,
      2
    )
  )
}

// Live homepage check
const html = await fetch('https://www.lurvox.in/?preview_theme_id=161086767355', {
  headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
}).then((r) => r.text())

console.log(
  JSON.stringify(
    {
      liveHome: {
        hasDietTracker: html.includes('Diet tracker'),
        hasWorkoutTracker: html.includes('Workout tracker'),
        hasSleepTracker: html.includes('Sleep tracker'),
        hasFlatClass: html.includes('ai-what-you-get-flat'),
        hasRewardsFirst: html.includes('REWARDS FIRST') || html.includes('Prize money'),
        hasRealCoaching: html.includes('REAL COACHING'),
        hasGoBack: html.includes('Go back'),
      },
    },
    null,
    2
  )
)

const leagueHtml = await fetch(
  'https://www.lurvox.in/pages/consistency-league?preview_theme_id=161086767355&v=' + Date.now(),
  { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
).then((r) => r.text())

console.log(
  JSON.stringify(
    {
      liveLeaguePreview: {
        hasBackClass: leagueHtml.includes('lx-league__back'),
        hasGoBack: leagueHtml.includes('Go back'),
        heroSnippet: (() => {
          const i = leagueHtml.indexOf('lx-league__hero')
          return i < 0 ? null : leagueHtml.slice(i, i + 280)
        })(),
      },
    },
    null,
    2
  )
)
