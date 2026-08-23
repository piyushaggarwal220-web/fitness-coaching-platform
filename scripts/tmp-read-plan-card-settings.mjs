/** Read-only: locate the homepage template + plan-card block settings on the live theme. */
import fs from 'node:fs'
import path from 'node:path'

const SHOP = '9uwyq1-0j.myshopify.com'
const GQL = `https://${SHOP}/admin/api/2025-01/graphql.json`
const THEME_GID = `gid://shopify/OnlineStoreTheme/${process.argv[2] || '161454620923'}`

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables = {}) {
  const res = await fetch(GQL, { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) })
  return res.json()
}

const QUERY = `
  query ThemeFiles($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      name
      files(filenames: $filenames, first: 20) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }
`

const out = await gql(QUERY, { id: THEME_GID, filenames: ['templates/index*.json'] })
const theme = out?.data?.theme
if (!theme) {
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}
console.log('theme:', theme.name)

for (const node of theme.files?.nodes ?? []) {
  const raw = node.body?.content
  if (!raw) continue
  let parsed
  try {
    parsed = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, ''))
  } catch {
    console.log('unparseable:', node.filename)
    continue
  }
  for (const [sectionId, section] of Object.entries(parsed.sections ?? {})) {
    for (const [blockId, block] of Object.entries(section.blocks ?? {})) {
      if (!/361650c/.test(block.type || '')) continue
      console.log('\n=== FILE:', node.filename)
      console.log('SECTION:', sectionId)
      console.log('BLOCK:', blockId, block.type)
      console.log(JSON.stringify(block.settings, null, 2))
    }
  }
}
