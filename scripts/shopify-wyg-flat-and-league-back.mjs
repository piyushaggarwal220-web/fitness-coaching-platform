/**
 * 1) League page: add Go back button
 * 2) What you get: rewards first, then one flat checklist of features (no card sections)
 *
 * Auth: %TEMP%/shopify-auth-token.json
 * Run: node scripts/shopify-wyg-flat-and-league-back.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
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
  // Reorder: highlight (rewards) before paragraph; support flat list mode.
  if (!liquid.includes('ai-what-you-get-flat-{{ ai_gen_id }}')) {
    liquid = liquid.replace(
      `.ai-what-you-get-highlight-{{ ai_gen_id }} {
    font-size: 12px;
    line-height: 1.5;
    color: {{ block.settings.highlight_color }};
    margin-bottom: 20px;
  }`,
      `.ai-what-you-get-highlight-{{ ai_gen_id }} {
    font-size: 14px;
    line-height: 1.55;
    font-weight: 600;
    color: {{ block.settings.highlight_color }};
    margin-bottom: 22px;
    padding: 14px 16px;
    border: 1px solid rgba(255, 98, 0, 0.35);
    border-radius: 14px;
    background: rgba(255, 98, 0, 0.08);
    white-space: pre-line;
  }

  .ai-what-you-get-flat-{{ ai_gen_id }} {
    background: #0B0B0B;
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 24px;
    padding: 8px 18px 18px;
    margin-bottom: 20px;
    box-shadow: 0 0 0 1px rgba(255,98,0,0.08), 0 10px 40px rgba(0,0,0,0.45);
  }

  .ai-what-you-get-flat-{{ ai_gen_id }} .ai-what-you-get-checklist-item-{{ ai_gen_id }} {
    padding-top: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .ai-what-you-get-flat-{{ ai_gen_id }} .ai-what-you-get-checklist-item-{{ ai_gen_id }}:last-child {
    border-bottom: none;
  }`
    )
  }

  // Replace header markup order: eyebrow, headline, highlight, paragraph, then flat or cards
  const oldHeader = `{% if block.settings.eyebrow_text != blank %}
      <div class="ai-what-you-get-eyebrow-{{ ai_gen_id }}">{{ block.settings.eyebrow_text }}</div>
    {% endif %}

    {% if block.settings.headline != blank %}
      <h2 class="ai-what-you-get-headline-{{ ai_gen_id }}">{{ block.settings.headline }}</h2>
    {% endif %}

    {% if block.settings.paragraph != blank %}
      <div class="ai-what-you-get-paragraph-{{ ai_gen_id }}">{{ block.settings.paragraph }}</div>
    {% endif %}

    {% if block.settings.highlight_text != blank %}
      <div class="ai-what-you-get-highlight-{{ ai_gen_id }}">{{ block.settings.highlight_text }}</div>
    {% endif %}`

  const newHeader = `{% if block.settings.eyebrow_text != blank %}
      <div class="ai-what-you-get-eyebrow-{{ ai_gen_id }}">{{ block.settings.eyebrow_text }}</div>
    {% endif %}

    {% if block.settings.headline != blank %}
      <h2 class="ai-what-you-get-headline-{{ ai_gen_id }}">{{ block.settings.headline }}</h2>
    {% endif %}

    {% if block.settings.highlight_text != blank %}
      <div class="ai-what-you-get-highlight-{{ ai_gen_id }}">{{ block.settings.highlight_text }}</div>
    {% endif %}

    {% if block.settings.paragraph != blank %}
      <div class="ai-what-you-get-paragraph-{{ ai_gen_id }}">{{ block.settings.paragraph }}</div>
    {% endif %}`

  if (liquid.includes(oldHeader)) {
    liquid = liquid.replace(oldHeader, newHeader)
  }

  // Inject flat list rendering before card_1 if not present
  if (!liquid.includes('block.settings.flat_list')) {
    const flatBlock = `
    {% if block.settings.flat_list %}
      <div class="ai-what-you-get-flat-{{ ai_gen_id }}" data-card-index="0">
        <div class="ai-what-you-get-checklist-{{ ai_gen_id }}">
          {% assign flat_items = "card_1_item_1,card_1_item_2,card_1_item_3,card_2_item_1,card_2_item_2,card_2_item_3,card_3_item_1,card_3_item_2,card_3_item_3,card_4_item_1,card_4_item_2,card_4_item_3" | split: "," %}
          {% for key in flat_items %}
            {% assign title_key = key | append: "_title" %}
            {% assign desc_key = key | append: "_description" %}
            {% assign title_val = block.settings[title_key] %}
            {% assign desc_val = block.settings[desc_key] %}
            {% if title_val != blank %}
              <div class="ai-what-you-get-checklist-item-{{ ai_gen_id }}">
                <svg class="ai-what-you-get-check-icon-{{ ai_gen_id }}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <div class="ai-what-you-get-item-content-{{ ai_gen_id }}">
                  <div class="ai-what-you-get-item-title-{{ ai_gen_id }}">{{ title_val }}</div>
                  {% if desc_val != blank %}
                    <div class="ai-what-you-get-item-description-{{ ai_gen_id }}">{{ desc_val }}</div>
                  {% endif %}
                </div>
              </div>
            {% endif %}
          {% endfor %}
        </div>
      </div>
    {% else %}
`
    liquid = liquid.replace(
      '    {% if block.settings.card_1_enabled %}',
      `${flatBlock}    {% if block.settings.card_1_enabled %}`
    )

    // Close the else before CTA / end of container — after last card endif
    // Find the pattern after card_4 endif closing
    const closeMarker =
      '    {% endif %}\n    {% if block.settings.cta_label != blank and block.settings.cta_url != blank %}'
    const closeMarkerAlt = '    {% endif %}\n  </div>\n</what-you-get-{{ ai_gen_id }}>'
    if (liquid.includes(closeMarker)) {
      liquid = liquid.replace(closeMarker, '    {% endif %}\n    {% endif %}\n    {% if block.settings.cta_label != blank and block.settings.cta_url != blank %}')
    } else if (liquid.includes(closeMarkerAlt) && !liquid.includes('{% endif %}\n    {% endif %}\n  </div>')) {
      // CTA may come after cards; insert endif before closing container after last card block
      liquid = liquid.replace(
        '    {% endif %}\n  </div>\n</what-you-get-{{ ai_gen_id }}>',
        '    {% endif %}\n    {% endif %}\n  </div>\n</what-you-get-{{ ai_gen_id }}>'
      )
    }

    // Schema setting
    if (!liquid.includes('"id": "flat_list"')) {
      liquid = liquid.replace(
        '    {\n      "type": "header",\n      "content": "League CTA"\n    },',
        `    {
      "type": "checkbox",
      "id": "flat_list",
      "label": "Flat checklist (no card sections)",
      "default": true
    },
    {
      "type": "header",
      "content": "League CTA"
    },`
      )
      // If League CTA header missing, insert before Layout
      if (!liquid.includes('"id": "flat_list"')) {
        liquid = liquid.replace(
          '    {\n      "type": "header",\n      "content": "Layout"\n    },',
          `    {
      "type": "checkbox",
      "id": "flat_list",
      "label": "Flat checklist (no card sections)",
      "default": true
    },
    {
      "type": "header",
      "content": "Layout"
    },`
        )
      }
    }
  }

  return liquid
}

function patchLeagueLiquid(liquid) {
  if (liquid.includes('lx-league__back')) return liquid

  liquid = liquid.replace(
    `<header class="lx-league__hero">
    <p class="lx-league__brand">LURVOX</p>`,
    `<header class="lx-league__hero">
    <a class="lx-league__back" href="/">← Go back</a>
    <p class="lx-league__brand">LURVOX</p>`
  )

  if (!liquid.includes('.lx-league__back')) {
    liquid = liquid.replace(
      `.lx-league__brand {
    margin: 0 0 18px;`,
      `.lx-league__back {
    display: inline-flex;
    align-items: center;
    margin: 0 0 22px;
    color: rgba(244, 240, 234, 0.72);
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .lx-league__back:hover {
    color: var(--lx-accent);
  }

  .lx-league__brand {
    margin: 0 0 18px;`
    )
  }

  return liquid
}

const themes = await gql(`{ themes(first: 15) { nodes { id name role } } }`)
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
    filenames: [
      'blocks/ai_gen_block_68d702b.liquid',
      'sections/lurvox-league.liquid',
      'templates/index.json',
    ],
  }
)

const byName = Object.fromEntries(
  fileData.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
)

let wygLiquid = byName['blocks/ai_gen_block_68d702b.liquid']
let leagueLiquid = byName['sections/lurvox-league.liquid']
const indexRaw = byName['templates/index.json']
if (!wygLiquid || !leagueLiquid || !indexRaw) throw new Error('Missing theme files')

wygLiquid = patchWhatYouGetLiquid(wygLiquid)
leagueLiquid = patchLeagueLiquid(leagueLiquid)

// Persist local league asset too
fs.writeFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  leagueLiquid
)

const index = JSON.parse(stripAutoHeader(indexRaw))
const contentSection = index.sections?.blocks_C9E4qf
const whatYouGet = findBlockEntry(contentSection, 'ai_gen_block_68d702b')
if (!whatYouGet) throw new Error('What you get block missing')

Object.assign(whatYouGet.block.settings, {
  flat_list: true,
  eyebrow_text: 'INCLUDED WITH EVERY PLAN',
  headline: 'What you get',
  paragraph: '',
  highlight_text:
    'REWARDS FIRST\nPrize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote',
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
fs.writeFileSync(path.join('scripts', 'tmp-wyg-flat-index.json'), nextIndex)
fs.writeFileSync(path.join('scripts', 'tmp-patched-wyg-flat.liquid'), wygLiquid)

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
        filename: 'blocks/ai_gen_block_68d702b.liquid',
        body: { type: 'TEXT', value: wygLiquid },
      },
      {
        filename: 'sections/lurvox-league.liquid',
        body: { type: 'TEXT', value: leagueLiquid },
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

console.log(
  JSON.stringify(
    {
      ok: true,
      upserted: upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename),
      league: 'https://www.lurvox.in/pages/consistency-league',
      note: 'What you get: rewards first + flat feature points; League page has Go back',
    },
    null,
    2
  )
)
