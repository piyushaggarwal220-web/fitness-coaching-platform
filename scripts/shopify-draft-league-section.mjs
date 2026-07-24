/**
 * Update Shopify draft homepage with a detailed Consistency League section.
 * Also expands FAQ + What you get league copy. Publishes the draft theme.
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-draft-league-section.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const draftMetaPath = path.join(process.env.TEMP, 'shopify-draft-theme.json')

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))

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
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

function findBlockEntry(section, typePrefix) {
  for (const [key, block] of Object.entries(section.blocks || {})) {
    if (block?.type === typePrefix || key.startsWith(typePrefix)) return { key, block }
  }
  return null
}

const themes = await gql(`{ themes(first: 25) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')

let draft = null
if (fs.existsSync(draftMetaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(draftMetaPath, 'utf8'))
    draft = themes.themes.nodes.find((t) => t.id === meta.draftThemeId) || null
  } catch {
    draft = null
  }
}

if (!draft) {
  draft = themes.themes.nodes.find((t) => t.name?.includes('LURVOX Sale Focus')) || null
}

if (!draft) {
  const draftName = `LURVOX Sale Focus ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const dup = await gql(
    `mutation themeDuplicate($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: main.id, name: draftName }
  )
  if (dup.themeDuplicate.userErrors?.length) {
    throw new Error(JSON.stringify(dup.themeDuplicate.userErrors, null, 2))
  }
  draft = dup.themeDuplicate.newTheme
}

fs.writeFileSync(
  draftMetaPath,
  JSON.stringify(
    {
      draftThemeId: draft.id,
      draftThemeName: draft.name,
      mainThemeId: main.id,
      createdAt: new Date().toISOString(),
    },
    null,
    2
  )
)

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
  { id: draft.id, filenames: ['templates/index.json'] }
)

let raw = fileData.theme.files.nodes[0]?.body?.content
if (!raw) {
  // Fallback to MAIN if draft file missing
  const mainFile = await gql(
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
    { id: main.id, filenames: ['templates/index.json'] }
  )
  raw = mainFile.theme.files.nodes[0]?.body?.content
}
if (!raw) throw new Error('templates/index.json missing')

const index = JSON.parse(stripAutoHeader(raw))
const contentSection = index.sections?.blocks_C9E4qf
if (!contentSection?.block_order) throw new Error('Homepage content section blocks_C9E4qf not found')

const whatYouGet = findBlockEntry(contentSection, 'ai_gen_block_68d702b')
const faq = findBlockEntry(contentSection, 'ai_gen_block_66d8696')
const leagueRoadmap = findBlockEntry(contentSection, 'ai_gen_block_6803fe6')
const compare = findBlockEntry(contentSection, 'ai_gen_block_99f4724')

if (whatYouGet?.block?.settings) {
  Object.assign(whatYouGet.block.settings, {
    card_4_title: 'CONSISTENCY LEAGUE',
    card_4_item_1_title: 'Monthly ladder with your squad',
    card_4_item_1_description:
      'Earn points from daily tracking, weekly check-ins, progress photos, and streaks. Ranked with your coach’s clients each month.',
    card_4_item_2_title: 'Climb Bronze → Crazy',
    card_4_item_2_description:
      'Top 10% promote each month: Bronze → Silver → Gold → Platinum → Diamond → Crazy 1/2/3. World Leaderboard coming soon.',
    card_4_item_3_title: 'Certificates, trophies & prize money',
    card_4_item_3_description:
      'Bronze–Gold: virtual certificates. Platinum & Diamond: physical trophies. Crazy tiers: prize money for top finishers.',
  })
}

if (faq?.block?.settings) {
  Object.assign(faq.block.settings, {
    question_2: 'WHAT EXACTLY IS INCLUDED?',
    answer_2:
      'Personal workout, personal diet, weekly coach check-ins, daily trackers, coach chat, progress photos/journey, Consistency League, and weekly plan updates. One price — no separate upsell for core coaching.',
    question_5: 'WHAT IS THE CONSISTENCY LEAGUE?',
    answer_5:
      'A monthly accountability ladder inside the app. You score points from daily trackers, check-ins, progress photos, and streaks. Each month the top 10% in your division promote up the ladder: Bronze → Silver → Gold → Platinum → Diamond → Crazy 1 → Crazy 2 → Crazy 3 (World Leaderboard coming soon). Bronze–Gold winners get virtual certificates; Platinum and Diamond winners get physical trophies; Crazy tiers include prize money. Profile photo + settings can be updated once per week. Optional — but powerful if you want competition with structure.',
  })
}

if (leagueRoadmap?.block?.settings) {
  Object.assign(leagueRoadmap.block.settings, {
    section_label: 'CONSISTENCY LEAGUE',
    section_headline: 'Climb the ladder. Get rewarded for showing up.',
    section_subheadline:
      'Included with coaching. Monthly seasons. Top 10% promote. Certificates, trophies, and prize money as you rise — so consistency becomes a game you want to win.',
    phase_1_day_badge: 'START HERE',
    phase_1_phase_badge: 'BRONZE → SILVER → GOLD',
    phase_1_title: 'Build the habit. Earn certificates.',
    phase_1_description:
      'Log daily trackers, hit weekly check-ins, and upload progress photos. Score points with your coach’s squad. Top 10% each month promote and unlock a virtual certificate as you move Bronze → Silver → Gold.',
    phase_2_day_badge: 'TROPHY TIERS',
    phase_2_phase_badge: 'PLATINUM → DIAMOND',
    phase_2_title: 'Physical trophies for elite consistency.',
    phase_2_description:
      'Still monthly. Still top 10% promote. Now the reward is a physical trophy when you finish in the promotion zone — proof on your shelf that you showed up when it counted.',
    phase_3_day_badge: 'PRIZE MONEY',
    phase_3_phase_badge: 'CRAZY 1 → CRAZY 2 → CRAZY 3',
    phase_3_title: 'High-stakes consistency. Real payouts.',
    phase_3_description:
      'The sharpest end of the ladder. Top 10% earn prize money and keep climbing Crazy 1 → Crazy 2 → Crazy 3. This is for clients who treat habits like competition.',
    phase_4_day_badge: 'COMING SOON',
    phase_4_phase_badge: 'WORLD LEADERBOARD',
    phase_4_title: 'Global ranking is next.',
    phase_4_description:
      'After Crazy 3, a World Leaderboard is launching so the best consistent athletes can compete beyond their coach’s squad. Stay locked in — the ladder keeps going.',
  })
}

if (compare?.block?.settings) {
  Object.assign(compare.block.settings, {
    feature_10_title: 'Consistency League included',
    feature_10_desc:
      'Monthly ladder, top 10% promote, certificates → trophies → prize money',
  })
}

// Place league roadmap after What you get when both exist
if (whatYouGet && leagueRoadmap) {
  const order = contentSection.block_order.filter((id) => id !== leagueRoadmap.key)
  const wygIdx = order.indexOf(whatYouGet.key)
  if (wygIdx >= 0) {
    order.splice(wygIdx + 1, 0, leagueRoadmap.key)
    contentSection.block_order = order
  }
}

const nextJson = JSON.stringify(index, null, 2)
fs.writeFileSync(path.join('scripts', 'tmp-draft-league-index.json'), nextJson)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: draft.id,
    files: [{ filename: 'templates/index.json', body: { type: 'TEXT', value: nextJson } }],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

// Publish draft so the live store gets the League section (user asked to ship copy).
const publish = await gql(
  `mutation themePublish($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: draft.id }
)

if (publish.themePublish.userErrors?.length) {
  console.warn('Upserted draft but publish failed:', JSON.stringify(publish.themePublish.userErrors, null, 2))
  console.log(
    JSON.stringify(
      {
        ok: true,
        published: false,
        draftThemeId: draft.id,
        draftThemeName: draft.name,
        note: 'Preview/publish manually in Shopify Admin → Themes',
      },
      null,
      2
    )
  )
  process.exit(0)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      published: true,
      themeId: publish.themePublish.theme.id,
      themeName: publish.themePublish.theme.name,
      role: publish.themePublish.theme.role,
      changes: [
        'Consistency League detailed roadmap section',
        'What you get card 4 expanded for League rewards',
        'FAQ: What is the Consistency League?',
        'Comparison table: League included',
      ],
    },
    null,
    2
  )
)
