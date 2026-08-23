import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const API_VERSION = '2025-01'
const GQL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
const REST = `https://${STORE}/admin/api/${API_VERSION}`
const RENDER = "{% render 'lurvox-orange-glow' %}"
const PRIORITY_DESCRIPTION =
  'Full coaching for 12 months. Lowest monthly cost, maximum consistency support, and priority check-ins.'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

function readAsset(filename) {
  return fs.readFileSync(path.join(__dirname, 'shopify-assets', filename), 'utf8')
}

const glow = readAsset('snippets-lurvox-orange-glow.liquid')
const compare = readAsset('snippets-lurvox-plan-compare-inline.liquid')
const compareSection = readAsset('sections-lurvox-plan-compare.liquid')
const homeSection = readAsset('sections-lurvox-home-redesign.liquid')

async function gql(query, variables = {}) {
  const response = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function numericThemeId(gid) {
  const match = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!match) throw new Error(`Invalid theme ID: ${gid}`)
  return match[1]
}

async function getAsset(themeId, key) {
  const response = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!response.ok) throw new Error(`GET ${key}: ${response.status}`)
  return (await response.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(`PUT ${key}: ${JSON.stringify(json.errors || json).slice(0, 500)}`)
  }
}

function patchHomepage(value) {
  if (!value || typeof value !== 'object') return 0
  let changes = 0

  if (Object.prototype.hasOwnProperty.call(value, 'plan_4_desc')) {
    value.plan_4_desc = PRIORITY_DESCRIPTION
    changes += 1
  }
  if (Object.prototype.hasOwnProperty.call(value, 'plan_4_description')) {
    value.plan_4_description = PRIORITY_DESCRIPTION
    changes += 1
  }

  if (value.type === 'lurvox-plan-compare' && value.blocks) {
    const alreadyPresent = Object.values(value.blocks).some(
      (block) => block?.settings?.feature === 'Priority check-ins'
    )
    if (!alreadyPresent) {
      let id = 'row_priority_checkins'
      let suffix = 2
      while (value.blocks[id]) {
        id = `row_priority_checkins_${suffix}`
        suffix += 1
      }
      value.blocks[id] = {
        type: 'row',
        settings: {
          feature: 'Priority check-ins',
          plan_3: false,
          plan_6: false,
          plan_12: true,
        },
      }
      value.block_order = [...(value.block_order ?? []), id]
      changes += 1
    }
  }

  for (const child of Object.values(value)) changes += patchHomepage(child)
  return changes
}

const themes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const adminMain = themes.find((theme) => theme.role === 'MAIN')
if (!adminMain) throw new Error('No MAIN Shopify theme found')
const requestedThemeId = process.argv[2]
const main = requestedThemeId
  ? themes.find((theme) => numericThemeId(theme.id) === requestedThemeId)
  : adminMain
if (!main) throw new Error(`Theme not found: ${requestedThemeId}`)

const themeId = numericThemeId(main.id)
const layoutKey = 'layout/theme.liquid'
let layout = await getAsset(themeId, layoutKey)
if (!layout.includes('{{ content_for_header }}') || !layout.includes('</head>')) {
  throw new Error('MAIN theme layout is missing required header markers')
}
if (!/{%-?\s*render\s+['"]lurvox-orange-glow['"]\s*-?%}/.test(layout)) {
  layout = layout.replace('</head>', `  ${RENDER}\n</head>`)
}

const indexKey = 'templates/index.json'
const index = JSON.parse(await getAsset(themeId, indexKey))
const homepageChanges = patchHomepage(index)
if (!homepageChanges) {
  throw new Error('No 12-month plan settings or comparison section found on homepage')
}

await putAsset(themeId, 'snippets/lurvox-orange-glow.liquid', glow)
await putAsset(themeId, 'snippets/lurvox-plan-compare-inline.liquid', compare)
await putAsset(themeId, 'sections/lurvox-plan-compare.liquid', compareSection)
await putAsset(themeId, 'sections/lurvox-home-redesign.liquid', homeSection)
await putAsset(themeId, indexKey, JSON.stringify(index, null, 2))
await putAsset(themeId, layoutKey, layout)

const verifiedIndex = await getAsset(themeId, indexKey)
const verifiedGlow = await getAsset(themeId, 'snippets/lurvox-orange-glow.liquid')
const verifiedCompare = await getAsset(
  themeId,
  'snippets/lurvox-plan-compare-inline.liquid'
)
const afterThemes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const afterMain = afterThemes.find((theme) => theme.role === 'MAIN')
if (afterMain?.id !== adminMain.id) throw new Error('MAIN theme changed during deployment')

console.log(
  JSON.stringify(
    {
      ok: true,
      published: main.role === 'MAIN',
      theme: main,
      homepageChanges,
      strongPlanShineInstalled: verifiedGlow.includes('--lx-text-glow-plan-details'),
      priorityPlanDescriptionInstalled: verifiedIndex.includes('priority check-ins'),
      priorityComparisonFeatureInstalled: verifiedCompare.includes('Priority check-ins'),
      liveUrl: `https://www.lurvox.in/?plan_shine=${Date.now()}`,
    },
    null,
    2
  )
)
