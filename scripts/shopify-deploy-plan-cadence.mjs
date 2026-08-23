import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

function patchCompareBlocks(section) {
  if (!section?.blocks) return false
  let changed = false
  for (const block of Object.values(section.blocks)) {
    if (block?.type !== 'row' || !block.settings) continue
    if (block.settings.feature === 'Weekly coach check-ins') {
      block.settings.feature = 'Mid week + weekly check ins'
      changed = true
    }
    if (block.settings.feature === 'Weekly plan updates') {
      block.settings.feature = 'Plan updates'
      block.settings.plan_3 = true
      block.settings.plan_6 = true
      block.settings.plan_12 = true
      block.settings.plan_3_text = 'Every 14 days'
      block.settings.plan_6_text = 'Every week'
      block.settings.plan_12_text = 'Every week'
      changed = true
    }
  }
  return changed
}

function patchCustomLiquid(value) {
  let next = value.replaceAll('Weekly coach check-ins', 'Mid week + weekly check ins')
  next = next.replace(
    /<tr>\s*<th scope="row">Weekly plan updates<\/th>[\s\S]*?<\/tr>/g,
    `<tr>
          <th scope="row">Plan updates</th>
          <td>Every 14 days</td>
          <td class="is-featured">Every week</td>
          <td>Every week</td>
        </tr>`
  )
  return next
}

function walkJson(node) {
  let changed = false
  if (!node || typeof node !== 'object') return false
  if (node.type === 'lurvox-plan-compare') changed = patchCompareBlocks(node) || changed
  if (typeof node.custom_liquid === 'string') {
    const patched = patchCustomLiquid(node.custom_liquid)
    if (patched !== node.custom_liquid) {
      node.custom_liquid = patched
      changed = true
    }
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') changed = walkJson(value) || changed
  }
  return changed
}

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const files = [
  {
    filename: 'snippets/lurvox-plan-compare-inline.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'sections/lurvox-plan-compare.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'sections/lurvox-how-it-works.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'snippets/lurvox-home-flow.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'templates/page.compare-plans.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-plans.json'),
        'utf8'
      ),
    },
  },
  {
    filename: 'templates/page.compare-detail.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-plans.json'),
        'utf8'
      ),
    },
  },
  {
    filename: 'templates/page.compare-stair.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-plans.json'),
        'utf8'
      ),
    },
  },
  {
    filename: 'templates/page.compare-short.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-plans.json'),
        'utf8'
      ),
    },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

for (const key of [
  'templates/index.json',
  'templates/page.find-your-plan.json',
  'templates/page.how-lurvox-works.json',
  'templates/page.json',
]) {
  try {
    const raw = await get(key)
    const json = JSON.parse(raw)
    if (walkJson(json)) {
      files.push({ filename: key, body: { type: 'TEXT', value: `${JSON.stringify(json, null, 2)}\n` } })
      console.log('patched', key)
    } else {
      console.log('no json patch', key)
    }
  } catch (err) {
    console.log('skip', key, err.message)
  }
}

async function upsert(batch) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      variables: {
        themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
        files: batch,
      },
    }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  if (json.data.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
  }
  console.log(
    'upserted',
    json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
  )
}

const jsonFiles = files.filter((f) => f.filename.endsWith('.json'))
const liquidFiles = files.filter((f) => !f.filename.endsWith('.json'))
await upsert(liquidFiles)
await upsert(jsonFiles)
