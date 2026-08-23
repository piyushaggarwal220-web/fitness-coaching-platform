/**
 * Fix duplicate WELCOME60 headers on homepage.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
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
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    const json = JSON.parse(text)
    if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
    return json.data
  }
  throw new Error('empty gql')
}

const localFiles = {
  'sections/header-group.json': path.join(DIR, 'sections__header-group.json'),
  'sections/lurvox-client-login.liquid': path.join(DIR, 'sections__lurvox-client-login.liquid'),
  'sections/lurvox-offer-home.liquid': path.join(DIR, 'sections__lurvox-offer-home.liquid'),
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const targets = themes.themes.nodes.filter((theme) => {
  const id = theme.id.split('/').pop()
  return (
    theme.role === 'MAIN' ||
    ['161389281531', '161390362875', '161391804667', '161375289595'].includes(id)
  )
})

const files = Object.entries(localFiles).map(([filename, filePath]) => ({
  filename,
  body: { type: 'TEXT', value: fs.readFileSync(filePath, 'utf8') },
}))

for (const theme of targets) {
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
  if (errors.length) console.log('errors', theme.id.split('/').pop(), errors)
  else console.log('ok', theme.id.split('/').pop())
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
