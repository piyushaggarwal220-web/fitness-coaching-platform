import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

// GraphQL Online Store theme files body
const gql = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `query($id: ID!) {
      theme(id: $id) {
        id
        name
        role
        files(filenames: ["layout/theme.liquid", "sections/header-group.json", "sections/lurvox-hide-1month.liquid", "templates/index.json"], first: 10) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText { content }
              ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
              ... on OnlineStoreThemeFileBodyUrl { url }
            }
          }
          userErrors { filename code message }
        }
      }
    }`,
    variables: { id: main.id },
  }),
})
const gqlJson = await gql.json()
if (gqlJson.errors) console.log('GQL errors:', JSON.stringify(gqlJson.errors, null, 1))
const files = gqlJson.data?.theme?.files?.nodes || []
for (const f of files) {
  const text = f.body?.content || ''
  console.log(`\n=== GraphQL ${f.filename} (${text.length} chars) ===`)
  if (f.filename === 'layout/theme.liquid') console.log('stamp:', text.match(/lurvox-cache-bust \d+/)?.[0] || 'NONE')
  if (f.filename.includes('header-group') || f.filename.includes('index.json')) {
    try {
      const j = JSON.parse(text)
      console.log('has hide_1month:', Boolean(j.sections?.lurvox_hide_1month))
      console.log('order:', j.order)
    } catch (e) {
      console.log('parse fail', e.message, text.slice(0, 100))
    }
  }
  if (f.filename.includes('hide-1month')) {
    console.log('exists, has showTrialPlan:', text.includes('showTrialPlan'))
    console.log('preview:', text.slice(0, 200))
  }
}
if (!files.find((f) => f.filename.includes('hide-1month'))) {
  console.log('\nGraphQL: sections/lurvox-hide-1month.liquid NOT PRESENT (deleted)')
}

// Storefront via preview_theme_id
console.log('\n--- storefront probes ---')
for (const u of [
  `https://www.lurvox.in/?preview_theme_id=161375289595&x=${Date.now()}`,
  `https://www.lurvox.in/?view=&x=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=161375289595&x=${Date.now()}`,
]) {
  const r = await fetch(u, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile' },
    redirect: 'follow',
  })
  const html = await r.text()
  console.log(u.slice(0, 70))
  console.log('  stamp:', html.match(/lurvox-cache-bust \d+/)?.[0] || 'NONE')
  console.log('  showTrialPlan:', html.includes('showTrialPlan'))
  console.log('  theme:', html.match(/"id":(\d+),"schema_name"/)?.[1])
}
