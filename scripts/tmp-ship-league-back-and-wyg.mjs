import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161086767355'

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

function stripAutoHeader(raw) {
  return raw.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

// --- League: new section filename to bust stale storefront compile ---
let league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)
league = league
  .replace(/\s*<!-- LX-LEAGUE-BACK-V3 -->\n?/, '\n')
  .replace('Climb the ladder NOW.', 'Climb the ladder.')
if (!league.includes('lx-league__back')) {
  league = league.replace(
    '<header class="lx-league__hero">',
    `<header class="lx-league__hero">
    <a class="lx-league__back" href="{{ routes.root_url }}">← Go back</a>`
  )
}
// Prefer Shopify root URL helper
league = league.replace(
  '<a class="lx-league__back" href="/">← Go back</a>',
  '<a class="lx-league__back" href="{{ routes.root_url }}">← Go back</a>'
)

const NEW_SECTION = 'sections/lurvox-consistency-league.liquid'
const NEW_TYPE = 'lurvox-consistency-league'

const pageTemplate = `{
  "sections": {
    "lurvox_consistency_league": {
      "type": "${NEW_TYPE}",
      "settings": {}
    }
  },
  "order": ["lurvox_consistency_league"]
}
`

fs.writeFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  league
)
fs.writeFileSync(
  path.join('scripts', 'shopify-assets', 'templates-page.league.json'),
  pageTemplate
)

// --- What you get: ensure flat list settings on homepage ---
const fileData = await gql(
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
    id: THEME_GID,
    filenames: [
      'templates/index.json',
      'blocks/ai_gen_block_68d702b.liquid',
    ],
  }
)
const byName = Object.fromEntries(
  fileData.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
)

const index = JSON.parse(stripAutoHeader(byName['templates/index.json']))
const contentSection = index.sections?.blocks_C9E4qf
if (!contentSection?.blocks) throw new Error('Homepage blocks section missing')

const wygKey = Object.keys(contentSection.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
if (!wygKey) throw new Error('What you get block missing')

Object.assign(contentSection.blocks[wygKey].settings, {
  flat_list: true,
  eyebrow_text: 'INCLUDED WITH EVERY PLAN',
  headline: 'What you get',
  paragraph: '',
  highlight_text:
    'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote',
  cta_label: 'Open the Consistency League →',
  cta_url: '/pages/consistency-league',

  card_1_enabled: true,
  card_1_title: '',
  card_1_item_1_title: 'Diet tracker',
  card_1_item_1_description: 'Log meals and stay on your macros every day.',
  card_1_item_2_title: 'Workout tracker',
  card_1_item_2_description: 'Track sessions, sets, and training consistency.',
  card_1_item_3_title: 'Sleep tracker',
  card_1_item_3_description: 'Monitor recovery so your coach can adjust load.',

  card_2_enabled: true,
  card_2_title: '',
  card_2_item_1_title: 'Water & steps tracker',
  card_2_item_1_description: 'Daily hydration and movement in one place.',
  card_2_item_2_title: 'Habits & supplements tracker',
  card_2_item_2_description: 'Never miss the small habits that drive results.',
  card_2_item_3_title: 'Personal diet chart',
  card_2_item_3_description: 'Meals built around your prefs, allergies, and lifestyle.',

  card_3_enabled: true,
  card_3_title: '',
  card_3_item_1_title: 'Personal workout plan',
  card_3_item_1_description: 'Gym, home, or mixed — matched to your experience.',
  card_3_item_2_title: 'Cardio & conditioning plan',
  card_3_item_2_description: 'Programmed with your training, not random HIIT spam.',
  card_3_item_3_title: 'Weekly coach check-ins',
  card_3_item_3_description: 'Photos, measurements, and plan updates from real data.',

  card_4_enabled: true,
  card_4_title: '',
  card_4_item_1_title: 'Progress photos & journey page',
  card_4_item_1_description: 'See your timeline and visual proof of change.',
  card_4_item_2_title: 'Direct coach chat',
  card_4_item_2_description: 'Ask when form, hunger, travel, or schedule changes.',
  card_4_item_3_title: 'Community that pushes you forward',
  card_4_item_3_description: 'Squad accountability inside the Consistency League.',
})

const nextIndex = JSON.stringify(index, null, 2)
let wygLiquid = byName['blocks/ai_gen_block_68d702b.liquid']
if (!wygLiquid.includes('block.settings.flat_list')) {
  throw new Error('WYG liquid missing flat_list support — run flat patch first')
}
if (!wygLiquid.includes('card_1_item_1_title')) {
  throw new Error('WYG liquid missing explicit flat item settings')
}

// Ensure highlight renders before paragraph (already does in patched file)
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), nextIndex)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`,
  {
    themeId: THEME_GID,
    files: [
      {
        filename: NEW_SECTION,
        body: { type: 'TEXT', value: league },
      },
      {
        filename: 'templates/page.league.json',
        body: { type: 'TEXT', value: pageTemplate },
      },
      {
        filename: 'templates/index.json',
        body: { type: 'TEXT', value: nextIndex },
      },
      {
        filename: 'blocks/ai_gen_block_68d702b.liquid',
        body: { type: 'TEXT', value: wygLiquid },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log('upserted', upsert.themeFilesUpsert.upsertedThemeFiles)

await new Promise((r) => setTimeout(r, 5000))

const leagueHtml = await fetch(
  'https://www.lurvox.in/pages/consistency-league?v=' + Date.now()
).then((r) => r.text())
const homeHtml = await fetch('https://www.lurvox.in/?v=' + Date.now()).then((r) => r.text())

const hero = leagueHtml.indexOf('lx-league__hero')
console.log(
  JSON.stringify(
    {
      league: {
        usesNewSection: leagueHtml.includes('lurvox_consistency_league') ||
          leagueHtml.includes('lurvox-consistency-league'),
        hasBack: leagueHtml.includes('lx-league__back'),
        hasGoBack: leagueHtml.includes('Go back'),
        hero: hero < 0 ? null : leagueHtml.slice(hero, hero + 320),
      },
      home: {
        hasFlatMarkup: homeHtml.includes('ai-what-you-get-flat-'),
        hasDietTracker: homeHtml.includes('Diet tracker'),
        hasRewards: homeHtml.includes('Prize money up to'),
        hasREWARDSFIRST: homeHtml.includes('REWARDS FIRST'),
        cardTitleHits: (homeHtml.match(/ai-what-you-get-card-title-/g) || []).length,
        checklistHits: (homeHtml.match(/Diet tracker|Workout tracker|Sleep tracker|Personal diet chart/g) || [])
          .length,
      },
    },
    null,
    2
  )
)
