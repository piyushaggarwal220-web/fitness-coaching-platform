import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
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
    if (text) {
      const json = JSON.parse(text)
      if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
      return json.data
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Shopify GraphQL returned an empty response')
}

async function getAsset(themeId, key) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(
      `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
    const text = await response.text()
    if (text) return JSON.parse(text).asset || null
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return null
}

const localFiles = {
  'sections/lurvox-client-login.liquid': 'sections__lurvox-client-login.liquid',
  'sections/lurvox-offer-home.liquid': 'sections__lurvox-offer-home.liquid',
  'sections/header-group.json': 'sections__header-group.json',
  'templates/index.json': 'templates__index.json',
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
      return themeId !== '161375289595' || filename !== 'templates/index.json'
    })
    .map(([filename, localName]) => ({
      filename,
      body: {
        type: 'TEXT',
        value: fs.readFileSync(path.join(DIR, localName), 'utf8'),
      },
    }))

  const overlay = await getAsset(themeId, 'assets/lurvox-offer-overlay.js')
  if (overlay?.value) {
    let value = overlay.value
      .replaceAll('SAVE5', 'WELCOME')
      .replace(
        'flex-wrap:wrap',
        'flex-wrap:nowrap;white-space:nowrap'
      )
      .replace(
        'gap:12px;min-height:48px',
        'gap:8px;min-height:48px;white-space:nowrap'
      )
    files.push({
      filename: 'assets/lurvox-offer-overlay.js',
      body: { type: 'TEXT', value },
    })
  }

  const result = await gql(
    `mutation themeFilesUpsert(
      $themeId: ID!
      $files: [OnlineStoreThemeFilesUpsertFileInput!]!
    ) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files }
  )

  const errors = result.themeFilesUpsert?.userErrors || []
  if (errors.length) {
    throw new Error(`${themeId}: ${JSON.stringify(errors)}`)
  }
  console.log(
    'updated',
    themeId,
    result.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename)
  )
}

const main = targets.find((theme) => theme.role === 'MAIN')
if (!main) throw new Error('MAIN theme not found')

const publish = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: main.id }
)
if (publish.themePublish.userErrors.length) {
  throw new Error(JSON.stringify(publish.themePublish.userErrors))
}
console.log('republished', publish.themePublish.theme)

for (const key of Object.keys(localFiles)) {
  const asset = await getAsset(main.id.split('/').pop(), key)
  console.log(key, {
    welcome: asset?.value?.includes('WELCOME'),
    save5: asset?.value?.includes('SAVE5'),
    nowrap: asset?.value?.includes('flex-wrap: nowrap'),
  })
}
