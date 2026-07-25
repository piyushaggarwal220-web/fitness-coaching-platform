/**
 * Make all homepage plan cards equally highlighted (no single default selection).
 * Requires Shopify auth at %TEMP%/shopify-auth-token.json
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const tokenPath = path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json')

async function gql(token, query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function patchLiquid(source) {
  let content = source

  // Equal shine: all cards look selected; no dimmed/unselected state
  const equalShineCss = `
  /* lurvox-equal-plan-shine */
  .ai-transformation-plan-card-{{ ai_gen_id }},
  .ai-transformation-plan-card-{{ ai_gen_id }}.selected {
    opacity: 1 !important;
    transform: scale(1) !important;
    background: {{ block.settings.selected_card_background }} !important;
    border: 1px solid {{ block.settings.selected_border_color }} !important;
    box-shadow: 0 0 30px {{ block.settings.glow_color }} !important;
  }
  .ai-transformation-plan-card-{{ ai_gen_id }}:hover {
    opacity: 1 !important;
    transform: scale(1) !important;
  }
  .ai-transformation-plan-card-{{ ai_gen_id }} .ai-transformation-plan-radio-{{ ai_gen_id }} {
    border-color: {{ block.settings.accent_color }} !important;
  }
  .ai-transformation-plan-card-{{ ai_gen_id }} .ai-transformation-plan-radio-{{ ai_gen_id }}::after {
    content: '' !important;
    opacity: 1 !important;
    transform: scale(1) !important;
    background: {{ block.settings.accent_color }} !important;
  }
`

  // Replace any previous equal-shine block so we can iterate
  content = content.replace(
    /\n?\s*\/\* lurvox-equal-plan-shine \*\/[\s\S]*?(?=\n\s*\/\* lurvox-plan-direct-nav \*\/|\n\{% endstyle %\})/,
    '\n'
  )

  if (content.includes('/* lurvox-plan-direct-nav */')) {
    content = content.replace(
      '/* lurvox-plan-direct-nav */',
      `${equalShineCss.trim()}\n  /* lurvox-plan-direct-nav */`
    )
  } else if (content.includes('{% endstyle %}')) {
    content = content.replace('{% endstyle %}', `${equalShineCss}\n{% endstyle %}`)
  } else {
    throw new Error('Could not find style insertion point in liquid')
  }

  // Always render every card as selected
  content = content.replace(
    /class="ai-transformation-plan-card-\{\{ ai_gen_id \}\}(?: \{% if plan_default %\}selected\{% endif %\}| selected)?"/g,
    'class="ai-transformation-plan-card-{{ ai_gen_id }} selected"'
  )

  // On connect, force all cards selected so no single default wins
  if (!content.includes('lurvox-force-all-selected')) {
    content = content.replace(
      'this.setupCardSelection();\n        this.updateCTA();',
      `this.setupCardSelection();\n        // lurvox-force-all-selected\n        this.cards.forEach((c) => c.classList.add('selected'));\n        this.updateCTA();`
    )
  }

  // Click: navigate only — keep all cards selected visually
  const oldClick = `card.addEventListener('click', () => {
            this.cards.forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            this.updateCTA();
            const link = card.getAttribute('data-plan-link');
            if (link && link !== '#' && link.trim()) {
              window.location.assign(link);
            }
          });`

  const newClick = `card.addEventListener('click', () => {
            this.cards.forEach((c) => c.classList.add('selected'));
            this.updateCTA();
            const link = card.getAttribute('data-plan-link');
            if (link && link !== '#' && link.trim()) {
              window.location.assign(link);
            }
          });`

  if (content.includes(oldClick)) {
    content = content.split(oldClick).join(newClick)
  } else if (
    content.includes("this.cards.forEach((c) => c.classList.remove('selected'));") &&
    content.includes('window.location.assign(link)')
  ) {
    content = content.replace(
      "this.cards.forEach((c) => c.classList.remove('selected'));\n            card.classList.add('selected');",
      "this.cards.forEach((c) => c.classList.add('selected'));"
    )
  }

  // Schema defaults: no single plan_default true
  content = content.replace(
    /("id": "plan_3_default",\s*"label": "Default selected",\s*"default": )true/,
    '$1false'
  )

  return content
}

function patchIndexDefaults(indexJson) {
  let content = indexJson
  for (const n of [1, 2, 3, 4]) {
    content = content.replace(
      new RegExp(`"plan_${n}_default"\\s*:\\s*true`, 'g'),
      `"plan_${n}_default": false`
    )
  }
  return content
}

async function main() {
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Missing Shopify token — run scripts/shopify-pkce-auth.mjs first')
  }
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token

  const themes = await gql(token, `{ themes(first: 20) { nodes { id name role } } }`)
  const live = themes.themes.nodes.find((t) => t.role === 'MAIN') ?? themes.themes.nodes[0]
  if (!live) throw new Error('No theme found')

  const filesQuery = await gql(
    token,
    `query ($id: ID!) {
      theme(id: $id) {
        files(filenames: ["templates/index.json"], first: 5) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: live.id }
  )

  const indexNode = filesQuery.theme.files.nodes.find((n) => n.filename === 'templates/index.json')
  if (!indexNode?.body?.content) throw new Error('templates/index.json not found')

  const indexContent = indexNode.body.content
  const blockMatch = indexContent.match(/blocks\/(ai_gen_block_[a-z0-9]+)\.liquid/i)
  const blockFilename = blockMatch ? `blocks/${blockMatch[1]}.liquid` : 'blocks/ai_gen_block_361650c.liquid'

  const blockFetch = await gql(
    token,
    `query ($id: ID!, $names: [String!]!) {
      theme(id: $id) {
        files(filenames: $names, first: 5) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: live.id, names: [blockFilename] }
  )

  const liquid = blockFetch.theme.files.nodes[0]?.body?.content
  if (!liquid) throw new Error(`Could not load ${blockFilename}`)

  const patchedLiquid = patchLiquid(liquid)
  const patchedIndex = patchIndexDefaults(indexContent)

  const result = await gql(
    token,
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId: live.id,
      files: [
        { filename: blockFilename, body: { type: 'TEXT', value: patchedLiquid } },
        { filename: 'templates/index.json', body: { type: 'TEXT', value: patchedIndex } },
      ],
    }
  )

  if (result.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(result.themeFilesUpsert.userErrors, null, 2))
  }

  console.log(JSON.stringify(result, null, 2))

  const localLiquid = path.join(process.cwd(), 'scripts/tmp-cta-blocks-ai_gen_block_361650c.liquid')
  if (fs.existsSync(localLiquid)) fs.writeFileSync(localLiquid, patchedLiquid)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
