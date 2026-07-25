import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-draft-theme.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`

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

const sectionLiquid = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid',
  'utf8'
)
const themeLayout = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-draft-layout-theme.liquid',
  'utf8'
)

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: draft.draftThemeId,
    files: [
      {
        filename: 'sections/mobile-floating-bar.liquid',
        body: { type: 'TEXT', value: sectionLiquid },
      },
      {
        filename: 'layout/theme.liquid',
        body: { type: 'TEXT', value: themeLayout },
      },
    ],
  }
)

console.log(JSON.stringify(data, null, 2))
