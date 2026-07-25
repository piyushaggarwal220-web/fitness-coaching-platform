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

function strip(content) {
  return content.replace(/^\/\*[\s\S]*?\*\//, '').trim()
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const files = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.contact.json"]) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id }
)

const raw = files.theme.files.nodes[0]?.body?.content
if (!raw) {
  console.log('No page.contact.json')
  process.exit(0)
}
const page = JSON.parse(strip(raw))
console.log('before order', page.order)
console.log(
  Object.entries(page.sections)
    .map(([id, s]) => `${id}:${s.type}:disabled=${s.disabled}`)
    .join(', ')
)

if (page.sections.main) page.sections.main.disabled = false

for (const [id, section] of Object.entries(page.sections)) {
  if (
    id !== 'main' &&
    (section.name === 'Plan selector' ||
      Object.values(section.blocks || {}).some(
        (b) => b.type === 'ai_gen_block_361650c' || b.settings?.plan_1_price
      ))
  ) {
    delete page.sections[id]
  }
}
page.order = Object.keys(page.sections)

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
        filename: 'templates/page.contact.json',
        body: { type: 'TEXT', value: JSON.stringify(page, null, 2) },
      },
    ],
  }
)
if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}
console.log('after order', page.order)
console.log('Updated contact template')
