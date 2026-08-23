/**
 * Deploy beige WELCOME60 header + consult form-only page + existing offer/plan assets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(ROOT, 'tmp-live-main')
const ASSETS = path.join(ROOT, 'shopify-assets')
const SOCIAL = path.join(ROOT, 'tmp-new-changes-theme', 'sections', 'lurvox-social-proof.liquid')
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(GQL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    })
    const text = await response.text()
    if (!text) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    const json = JSON.parse(text)
    if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
    return json.data
  }
  throw new Error('empty gql response')
}

const localFiles = {
  'sections/lurvox-offer-home.liquid': path.join(DIR, 'sections__lurvox-offer-home.liquid'),
  'sections/lurvox-client-login.liquid': path.join(DIR, 'sections__lurvox-client-login.liquid'),
  'sections/header-group.json': path.join(DIR, 'sections__header-group.json'),
  'templates/index.json': path.join(DIR, 'templates__index.json'),
  'blocks/ai_gen_block_361650c.liquid': path.join(DIR, 'blocks__ai_gen_block_361650c.liquid'),
  'sections/lurvox-talk-to-coach.liquid': path.join(ASSETS, 'sections-lurvox-talk-to-coach.liquid'),
  'templates/page.talk-to-a-coach.json': path.join(ASSETS, 'templates-page.talk-to-a-coach.json'),
}

if (fs.existsSync(SOCIAL)) {
  localFiles['sections/lurvox-social-proof.liquid'] = SOCIAL
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const targets = themes.themes.nodes.filter((theme) => {
  const id = theme.id.split('/').pop()
  return (
    theme.role === 'MAIN' ||
    ['161389281531', '161390362875', '161391804667', '161375289595'].includes(id)
  )
})

for (const theme of targets) {
  const themeId = theme.id.split('/').pop()
  const files = Object.entries(localFiles)
    .filter(([filename]) => {
      if (themeId === '161375289595' && filename === 'templates/index.json') return false
      return true
    })
    .map(([filename, filePath]) => ({
      filename,
      body: { type: 'TEXT', value: fs.readFileSync(filePath, 'utf8') },
    }))

  const result = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files }
  )
  const errors = result.themeFilesUpsert?.userErrors || []
  if (errors.length) console.log('errors', themeId, JSON.stringify(errors))
  else
    console.log(
      'ok',
      themeId,
      result.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
    )
}

const main = targets.find((t) => t.role === 'MAIN')
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: main.id }
)
console.log('published', main.id.split('/').pop(), main.name)
