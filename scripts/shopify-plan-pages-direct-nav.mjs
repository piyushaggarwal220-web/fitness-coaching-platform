/**
 * Homepage plan selector: remove bottom CTA; clicking a plan opens its app page.
 * Requires Shopify auth token at %TEMP%/shopify-auth-token.json
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'
const tokenPath = path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json')

const PLAN_PAGE_LINKS = {
  1: `${APP}/plans/1-month`,
  2: `${APP}/plans/3-months`,
  3: `${APP}/plans/6-months`,
  4: `${APP}/plans/12-months`,
}

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

  // Hide CTA wrapper via CSS (keeps schema intact if block settings still reference it)
  if (!content.includes('/* lurvox-plan-direct-nav */')) {
    content = content.replace(
      '{% endstyle %}',
      `  /* lurvox-plan-direct-nav */
  .ai-transformation-plan-cta-wrapper-{{ ai_gen_id }} {
    display: none !important;
  }
{% endstyle %}`
    )
  }

  // Navigate on card click instead of only updating the CTA href
  const oldClick = `card.addEventListener('click', () => {
            this.cards.forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            this.updateCTA();
          });`

  const newClick = `card.addEventListener('click', () => {
            this.cards.forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            this.updateCTA();
            const link = card.getAttribute('data-plan-link');
            if (link && link !== '#' && link.trim()) {
              window.location.assign(link);
            }
          });`

  if (content.includes(oldClick)) {
    content = content.split(oldClick).join(newClick)
  } else if (!content.includes('window.location.assign(link)')) {
    throw new Error('Could not locate plan card click handler to patch')
  }

  return content
}

function patchIndexPlanLinks(indexJson) {
  let content = indexJson
  const replacements = [
    [/https:\/\/app\.lurvox\.in\/checkout\?plan=1_month/g, PLAN_PAGE_LINKS[1]],
    [/https:\/\/app\.lurvox\.in\/checkout\?plan=3_months/g, PLAN_PAGE_LINKS[2]],
    [/https:\/\/app\.lurvox\.in\/checkout\?plan=6_months/g, PLAN_PAGE_LINKS[3]],
    [/https:\/\/app\.lurvox\.in\/checkout\?plan=12_months/g, PLAN_PAGE_LINKS[4]],
  ]
  for (const [from, to] of replacements) {
    content = content.replace(from, to)
  }
  return content
}

async function main() {
  if (!fs.existsSync(tokenPath)) {
    console.error('Missing Shopify token at', tokenPath)
    console.error('Skipped live theme deploy. App plan pages are ready at /plans/{1-month|3-months|6-months|12-months}.')
    process.exit(0)
  }

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token

  const themes = await gql(
    token,
    `{ themes(first: 20) { nodes { id name role } } }`
  )
  const live = themes.themes.nodes.find((t) => t.role === 'MAIN') ?? themes.themes.nodes[0]
  if (!live) throw new Error('No theme found')

  // Prefer known local liquid copy; fall back to fetching from theme
  const localLiquid = path.join(
    process.cwd(),
    'scripts/tmp-cta-blocks-ai_gen_block_361650c.liquid'
  )
  let liquid = fs.existsSync(localLiquid) ? fs.readFileSync(localLiquid, 'utf8') : null

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
  if (!indexNode?.body?.content) throw new Error('templates/index.json not found on theme')

  // Discover block liquid filename from index if possible
  const indexContent = indexNode.body.content
  const blockMatch = indexContent.match(/blocks\/(ai_gen_block_[a-z0-9]+)\.liquid/i)
  const blockFilename = blockMatch ? `blocks/${blockMatch[1]}.liquid` : null

  if (!liquid && blockFilename) {
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
    liquid = blockFetch.theme.files.nodes[0]?.body?.content ?? null
  }

  if (!liquid) throw new Error('Could not load plan selector liquid')

  const patchedLiquid = patchLiquid(liquid)
  const patchedIndex = patchIndexPlanLinks(indexContent)

  const files = [
    {
      filename: blockFilename || 'blocks/ai_gen_block_361650c.liquid',
      body: { type: 'TEXT', value: patchedLiquid },
    },
    {
      filename: 'templates/index.json',
      body: { type: 'TEXT', value: patchedIndex },
    },
  ]

  const result = await gql(
    token,
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: live.id, files }
  )

  console.log(JSON.stringify(result, null, 2))

  // Keep local liquid in sync for future runs
  if (fs.existsSync(localLiquid)) {
    fs.writeFileSync(localLiquid, patchedLiquid)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
