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

function itemMarkup(aiId, titleSetting, descSetting) {
  return `{% if block.settings.${titleSetting} != blank %}
              <div class="ai-what-you-get-checklist-item-{{ ai_gen_id }}">
                <svg class="ai-what-you-get-check-icon-{{ ai_gen_id }}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <div class="ai-what-you-get-item-content-{{ ai_gen_id }}">
                  <div class="ai-what-you-get-item-title-{{ ai_gen_id }}">{{ block.settings.${titleSetting} }}</div>
                  {% if block.settings.${descSetting} != blank %}
                    <div class="ai-what-you-get-item-description-{{ ai_gen_id }}">{{ block.settings.${descSetting} }}</div>
                  {% endif %}
                </div>
              </div>
            {% endif %}`
}

const themes = await gql(`{ themes(first: 25) { nodes { id role name } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')
console.log('Theme', main.name, main.id)
const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id, filenames: ['blocks/ai_gen_block_68d702b.liquid'] }
)

let liquid = files.theme.files.nodes[0].body.content

const flatStart = liquid.indexOf('{% if block.settings.flat_list %}')
const elseIdx = liquid.indexOf('{% else %}', flatStart)
if (flatStart < 0 || elseIdx < 0) throw new Error('flat_list block not found')

const keys = [
  ['card_1_item_1_title', 'card_1_item_1_description'],
  ['card_1_item_2_title', 'card_1_item_2_description'],
  ['card_1_item_3_title', 'card_1_item_3_description'],
  ['card_2_item_1_title', 'card_2_item_1_description'],
  ['card_2_item_2_title', 'card_2_item_2_description'],
  ['card_2_item_3_title', 'card_2_item_3_description'],
  ['card_3_item_1_title', 'card_3_item_1_description'],
  ['card_3_item_2_title', 'card_3_item_2_description'],
  ['card_3_item_3_title', 'card_3_item_3_description'],
  ['card_4_item_1_title', 'card_4_item_1_description'],
  ['card_4_item_2_title', 'card_4_item_2_description'],
  ['card_4_item_3_title', 'card_4_item_3_description'],
]

const explicitFlat = `{% if block.settings.flat_list %}
      <div class="ai-what-you-get-flat-{{ ai_gen_id }}" data-card-index="0">
        <div class="ai-what-you-get-checklist-{{ ai_gen_id }}">
            ${keys.map(([t, d]) => itemMarkup('x', t, d)).join('\n            ')}
        </div>
      </div>
    {% else %}
`

liquid = liquid.slice(0, flatStart) + explicitFlat + liquid.slice(elseIdx + '{% else %}'.length)

// Animate flat list too
liquid = liquid.replace(
  "const cards = this.querySelectorAll('.ai-what-you-get-card-{{ ai_gen_id }}');",
  "const cards = this.querySelectorAll('.ai-what-you-get-card-{{ ai_gen_id }}, .ai-what-you-get-flat-{{ ai_gen_id }}');"
)

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
        body: { type: 'TEXT', value: liquid },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

fs.writeFileSync(path.join('scripts', 'tmp-patched-wyg-flat.liquid'), liquid)
console.log(JSON.stringify({ ok: true, upserted: upsert.themeFilesUpsert.upsertedThemeFiles }, null, 2))
