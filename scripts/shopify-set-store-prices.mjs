/**
 * Set store plan prices to 499 / 999 / 1699 / 2999 on draft + live MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-draft-theme.json'), 'utf8')
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

function applyPrices(index) {
  let block = null
  for (const section of Object.values(index.sections || {})) {
    for (const [key, candidate] of Object.entries(section.blocks || {})) {
      if (
        candidate?.type === 'ai_gen_block_361650c' ||
        key.includes('361650c') ||
        candidate?.settings?.plan_1_price
      ) {
        block = candidate
        break
      }
    }
    if (block) break
  }
  if (!block?.settings) throw new Error('Pricing block not found')

  const s = block.settings
  s.plan_1_price = '499'
  s.plan_1_monthly = '₹499/month'
  s.plan_1_original_price = ''
  s.plan_1_savings = ''
  s.plan_1_link = `${APP}/checkout?plan=1_month`

  s.plan_2_price = '999'
  s.plan_2_original_price = '1497'
  s.plan_2_savings = 'SAVE ₹498'
  s.plan_2_monthly = '≈ ₹333/month'
  s.plan_2_link = `${APP}/checkout?plan=3_months`

  s.plan_3_price = '1699'
  s.plan_3_original_price = '2994'
  s.plan_3_savings = 'SAVE ₹1,295'
  s.plan_3_monthly = '≈ ₹283/month'
  s.plan_3_link = `${APP}/checkout?plan=6_months`

  s.plan_4_price = '2999'
  s.plan_4_original_price = '5988'
  s.plan_4_savings = 'SAVE ₹2,989'
  s.plan_4_monthly = '≈ ₹250/month'
  s.plan_4_link = `${APP}/checkout?plan=12_months`

  return {
    p1: s.plan_1_price,
    p2: s.plan_2_price,
    p3: s.plan_3_price,
    p4: s.plan_4_price,
  }
}

async function updateTheme(themeId, label) {
  const fileData = await gql(
    `query ($id: ID!) {
      theme(id: $id) {
        name
        role
        files(filenames: ["templates/index.json"]) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }`,
    { id: themeId }
  )

  const content = fileData.theme.files.nodes[0]?.body?.content
  if (!content) throw new Error(`No index.json on ${label}`)

  const index = JSON.parse(stripAutoHeader(content))
  const prices = applyPrices(index)

  const result = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId,
      files: [
        {
          filename: 'templates/index.json',
          body: { type: 'TEXT', value: JSON.stringify(index, null, 2) + '\n' },
        },
      ],
    }
  )

  if (result.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(result.themeFilesUpsert.userErrors, null, 2))
  }

  console.log(`${label} (${fileData.theme.name} / ${fileData.theme.role}):`, prices)
  return index
}

const themes = await gql(`{
  themes(first: 20) {
    nodes { id name role }
  }
}`)

const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('MAIN theme not found')

const draftIndex = await updateTheme(draft.draftThemeId, 'draft')
await updateTheme(main.id, 'live')

fs.writeFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/tmp-draft-templates-index.json'),
  JSON.stringify(draftIndex, null, 2) + '\n'
)

console.log('done')
