import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const league = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-lurvox-league.liquid'),
  'utf8'
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
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

if (!league.includes('lx-league__back')) throw new Error('Local league file missing back button')

const themes = await gql(`{ themes(first: 25) { nodes { id role name } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

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
        filename: 'sections/lurvox-league.liquid',
        body: { type: 'TEXT', value: league },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

// Re-read to confirm
const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id, filenames: ['sections/lurvox-league.liquid'] }
)
const remote = files.theme.files.nodes[0].body.content
console.log(
  JSON.stringify(
    {
      ok: true,
      theme: main.name,
      remoteHasBack: remote.includes('lx-league__back'),
      remoteSnippet: remote.slice(remote.indexOf('lx-league__hero'), remote.indexOf('lx-league__hero') + 220),
    },
    null,
    2
  )
)
