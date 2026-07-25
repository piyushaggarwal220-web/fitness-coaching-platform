import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const THEME_ID = 'gid://shopify/OnlineStoreTheme/160888094971'
const INDEX_PATH = 'C:/Users/DELL/coaching-platform/scripts/tmp-theme-templates-index.json'

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
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

let content = fs.readFileSync(INDEX_PATH, 'utf8')
const replacements = [
  ['https://rzp.io/rzp/Qy2B2PdM', 'https://app.lurvox.in/checkout?plan=1_month'],
  ['https://rzp.io/rzp/S4rsNLf', 'https://app.lurvox.in/checkout?plan=3_months'],
  ['https://rzp.io/rzp/sBMjcJv', 'https://app.lurvox.in/checkout?plan=6_months'],
  ['https://rzp.io/rzp/f2jJo5ns', 'https://app.lurvox.in/checkout?plan=12_months'],
]

for (const [from, to] of replacements) {
  if (!content.includes(from)) {
    console.error('Missing expected URL:', from)
    process.exit(1)
  }
  content = content.split(from).join(to)
}

fs.writeFileSync(INDEX_PATH, content)

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: THEME_ID,
    files: [
      {
        filename: 'templates/index.json',
        body: { type: 'TEXT', value: content },
      },
    ],
  }
)

console.log(JSON.stringify(data, null, 2))
