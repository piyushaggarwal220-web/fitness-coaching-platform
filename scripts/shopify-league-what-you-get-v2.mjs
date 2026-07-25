/**
 * 1) Add League CTA to What you get block
 * 2) Upload lavish Consistency League page section + template
 * 3) Create/update /pages/consistency-league
 * 4) Rewrite What you get homepage copy (sales-focused)
 * 5) Publish stays on current MAIN theme (in-place upsert)
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-league-what-you-get-v2.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const LEAGUE_PATH = '/pages/league'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

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

function patchWhatYouGetLiquid(liquid) {
  if (liquid.includes('cta_label')) return liquid

  const styleInsert = `
  .ai-what-you-get-cta-wrap-{{ ai_gen_id }} {
    margin-top: 8px;
    margin-bottom: 8px;
    display: flex;
    justify-content: center;
  }

  .ai-what-you-get-cta-{{ ai_gen_id }} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 48px;
    padding: 0 22px;
    border-radius: 999px;
    background: {{ block.settings.cta_background | default: '#ff6200' }};
    color: {{ block.settings.cta_text_color | default: '#111111' }};
    border: 1px solid {{ block.settings.cta_background | default: '#ff6200' }};
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    transition: transform 200ms ease, filter 200ms ease;
  }

  .ai-what-you-get-cta-{{ ai_gen_id }}:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }
`

  liquid = liquid.replace(
    '  .ai-what-you-get-item-description-{{ ai_gen_id }} {\n    font-size: 12px;\n    line-height: 1.4;\n    color: {{ block.settings.item_description_color }};\n  }\n{% endstyle %}',
    `  .ai-what-you-get-item-description-{{ ai_gen_id }} {\n    font-size: 12px;\n    line-height: 1.4;\n    color: {{ block.settings.item_description_color }};\n  }\n${styleInsert}{% endstyle %}`
  )

  const ctaMarkup = `
    {% if block.settings.cta_label != blank and block.settings.cta_url != blank %}
      <div class="ai-what-you-get-cta-wrap-{{ ai_gen_id }}">
        <a class="ai-what-you-get-cta-{{ ai_gen_id }}" href="{{ block.settings.cta_url }}">
          {{ block.settings.cta_label }}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    {% endif %}
`

  liquid = liquid.replace(
    '    {% endif %}\n  </div>\n</what-you-get-{{ ai_gen_id }}>',
    `    {% endif %}\n${ctaMarkup}  </div>\n</what-you-get-{{ ai_gen_id }}>`
  )

  const schemaInsert = `
    {
      "type": "header",
      "content": "League CTA"
    },
    {
      "type": "text",
      "id": "cta_label",
      "label": "CTA label",
      "default": "Explore the Consistency League"
    },
    {
      "type": "url",
      "id": "cta_url",
      "label": "CTA link"
    },
    {
      "type": "color",
      "id": "cta_background",
      "label": "CTA background",
      "default": "#ff6200"
    },
    {
      "type": "color",
      "id": "cta_text_color",
      "label": "CTA text",
      "default": "#111111"
    },
`

  liquid = liquid.replace(
    '    {\n      "type": "header",\n      "content": "Layout"\n    },',
    `${schemaInsert}    {\n      "type": "header",\n      "content": "Layout"\n    },`
  )

  if (!liquid.includes('cta_label')) {
    throw new Error('Failed to patch What you get liquid with CTA settings')
  }
  return liquid
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme')
console.log('Theme', main.name, main.id)

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
    id: main.id,
    filenames: ['blocks/ai_gen_block_68d702b.liquid', 'templates/index.json'],
  }
)

const byName = Object.fromEntries(
  fileData.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
)
if (!byName['blocks/ai_gen_block_68d702b.liquid']) {
  throw new Error('What you get block missing')
}
if (!byName['templates/index.json']) throw new Error('index.json missing')

const patchedBlock = patchWhatYouGetLiquid(byName['blocks/ai_gen_block_68d702b.liquid'])
const leagueSection = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
)
const leagueTemplate = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'templates-page.league.json'),
  'utf8'
)

const index = JSON.parse(stripAutoHeader(byName['templates/index.json']))
const contentSection = index.sections?.blocks_C9E4qf
if (!contentSection) throw new Error('Homepage content section missing')

const whatYouGet = findBlockEntry(contentSection, 'ai_gen_block_68d702b')
const faq = findBlockEntry(contentSection, 'ai_gen_block_66d8696')
if (!whatYouGet) throw new Error('What you get block not found in index')

Object.assign(whatYouGet.block.settings, {
  eyebrow_text: 'EVERY PLAN INCLUDES THIS — NO HIDDEN UPSELLS',
  headline: 'What you actually get.\nAnd how consistency pays you back.',
  paragraph:
    'LURVOX is not a PDF dump. You get a human coach, a living plan, daily systems that keep you honest, a journey that proves progress, and free Consistency League entry — with Crazy League prize money up to ₹5,000 unlocked on the 12-month plan.',
  highlight_text:
    'CONSISTENCY LEAGUE: Monthly ladder · Top 10% promote · Certificates · Physical trophies · Prize money up to ₹5,000. Stay consistent → climb → win.',
  cta_label: 'Open the Consistency League →',
  cta_url: LEAGUE_PATH,
  cta_background: '#ff6200',
  cta_text_color: '#111111',

  card_1_title: 'REAL COACHING — NOT A TEMPLATE',
  card_1_item_1_title: 'Personal workout + diet',
  card_1_item_1_description:
    'Built for your body, schedule, food prefs, injuries, and gym/home setup — delivered in 24–48 hours after onboarding.',
  card_1_item_2_title: 'A coach who owns your case',
  card_1_item_2_description:
    'Human reviews, weekly adjustments, and direct chat. Tools speed the busywork — they never replace your coach.',
  card_1_item_3_title: 'Weekly check-ins that stop plateaus',
  card_1_item_3_description:
    'Photos, measurements, adherence, and recovery reviewed so your plan evolves with real data — not month-1 guesswork.',

  card_2_title: 'SYSTEMS THAT FORCE CONSISTENCY',
  card_2_item_1_title: 'Daily trackers (all in one place)',
  card_2_item_1_description:
    'Workout, diet, water, sleep, steps, supplements, and habits — so nothing important slips through the cracks.',
  card_2_item_2_title: 'Journey page with proof',
  card_2_item_2_description:
    'Your timeline of check-ins, progress photos, and coaching history — visual proof you are moving, not guessing.',
  card_2_item_3_title: 'Progress photos that drive decisions',
  card_2_item_3_description:
    'Front / side / back photos feed both your coach and the league score — accountability you can see.',

  card_3_title: 'A COMMUNITY THAT PUSHES FORWARD',
  card_3_item_1_title: 'Squad accountability',
  card_3_item_1_description:
    'You are not alone in a silent app. Your coach’s clients climb the same ladder — peer pressure that works for you.',
  card_3_item_2_title: 'Support that keeps you moving',
  card_3_item_2_description:
    'Missed weeks, travel, and busy seasons get plan adjustments — the culture is progress, not perfection theatre.',
  card_3_item_3_title: 'Shared standard of showing up',
  card_3_item_3_description:
    'When the people around you track and check in, quitting becomes the harder choice.',

  card_4_title: 'CONSISTENCY LEAGUE — WIN REAL REWARDS',
  card_4_item_1_title: 'Stay consistent → climb monthly',
  card_4_item_1_description:
    'Score points from trackers, check-ins, photos, and streaks. Top 10% promote each month up the ladder.',
  card_4_item_2_title: 'Certificates & physical trophies',
  card_4_item_2_description:
    'Bronze–Gold: virtual certificates. Platinum & Diamond: physical trophies you can put on a shelf.',
  card_4_item_3_title: 'Prize money up to ₹5,000',
  card_4_item_3_description:
    'Crazy League (prize tiers) is for 12-month members — top finishers can win cash up to ₹5,000. Every other plan still gets free league entry for certificates and trophies.',
})

if (faq?.block?.settings) {
  Object.assign(faq.block.settings, {
    question_5: 'WHAT IS THE CONSISTENCY LEAGUE?',
    answer_5:
      'A monthly accountability ladder inside the LURVOX app. Entry is free with every coaching plan. You earn points from daily trackers, weekly check-ins, progress photos, and streaks. Top 10% in your division promote each month: Bronze → Silver → Gold → Platinum → Diamond (certificates & trophies). Crazy 1/2/3 is the prize-money arena — up to ₹5,000 — and requires the 12-month plan. World Leaderboard coming soon. Open /pages/consistency-league for the full breakdown.',
  })
}

const nextIndex = JSON.stringify(index, null, 2)
fs.writeFileSync(path.join('scripts', 'tmp-draft-wyg-league-v2-index.json'), nextIndex)
fs.writeFileSync(path.join('scripts', 'tmp-patched-ai_gen_block_68d702b.liquid'), patchedBlock)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [
      {
        filename: 'sections/lurvox-consistency-league.liquid',
        body: { type: 'TEXT', value: leagueSection },
      },
      {
        filename: 'sections/lurvox-league.liquid',
        body: { type: 'TEXT', value: leagueSection },
      },
      {
        filename: 'templates/page.league.json',
        body: { type: 'TEXT', value: leagueTemplate },
      },
      {
        filename: 'blocks/ai_gen_block_68d702b.liquid',
        body: { type: 'TEXT', value: patchedBlock },
      },
      {
        filename: 'templates/index.json',
        body: { type: 'TEXT', value: nextIndex },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

const pages = await gql(`{
  pages(first: 100) {
    nodes { id handle title templateSuffix }
  }
}`)
const existing = pages.pages.nodes.find((p) => p.handle === 'consistency-league')

const pageBody = `
<div style="display:none">Consistency League — free entry with every plan; Crazy League prize money up to ₹5,000 requires the 12-month plan.</div>
`.trim()

let pageResult
if (existing) {
  pageResult = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle title templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      id: existing.id,
      page: {
        title: 'Consistency League',
        handle: 'consistency-league',
        body: pageBody,
        templateSuffix: 'league',
        isPublished: true,
      },
    }
  )
  if (pageResult.pageUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(pageResult.pageUpdate.userErrors, null, 2))
  }
  pageResult = pageResult.pageUpdate.page
} else {
  pageResult = await gql(
    `mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle title templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title: 'Consistency League',
        handle: 'consistency-league',
        body: pageBody,
        templateSuffix: 'league',
        isPublished: true,
      },
    }
  )
  if (pageResult.pageCreate.userErrors?.length) {
    throw new Error(JSON.stringify(pageResult.pageCreate.userErrors, null, 2))
  }
  pageResult = pageResult.pageCreate.page
}

console.log(
  JSON.stringify(
    {
      ok: true,
      theme: { id: main.id, name: main.name },
      upserted: upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename),
      page: {
        id: pageResult.id,
        handle: pageResult.handle,
        templateSuffix: pageResult.templateSuffix,
        url: `https://www.lurvox.in${LEAGUE_PATH}`,
      },
      homepageCta: LEAGUE_PATH,
    },
    null,
    2
  )
)
