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

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const files = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.json", "templates/page.policy.json"]) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id }
)
for (const n of files.theme.files.nodes) {
  const raw = (n.body?.content || '').replace(/^\/\*[\s\S]*?\*\//, '').trim()
  const j = JSON.parse(raw)
  console.log('\n==', n.filename, '==')
  console.log('order', j.order)
  console.log(
    Object.entries(j.sections)
      .map(([id, s]) => `${id}:${s.type}:disabled=${s.disabled}`)
      .join(', ')
  )
}

const pages = await gql(`{
  pages(first: 50) {
    nodes { handle templateSuffix }
  }
}`)
for (const p of pages.pages.nodes.filter((x) =>
  /privacy|terms|refund|shipping|about|pricing|contact/.test(x.handle)
)) {
  console.log(p.handle, '->', p.templateSuffix || '(default)')
}

const url = 'https://www.lurvox.in/pages/privacy-policy?cb=' + Date.now()
const html = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text())
console.log('\nFetch', url)
console.log('journey', html.includes('Choose The Journey'))
console.log('privacy explain', html.includes('This Privacy Policy explains'))
console.log('page title h1', /Privacy Policy/i.test(html))
// Extract main content snippet
const idx = html.indexOf('This Privacy Policy explains')
console.log('snippet', idx > -1 ? html.slice(idx, idx + 120).replace(/\s+/g, ' ') : 'NOT FOUND')
const jIdx = html.indexOf('Choose The Journey')
console.log('journey snippet', jIdx > -1 ? html.slice(Math.max(0, jIdx - 80), jIdx + 80).replace(/\s+/g, ' ') : 'NOT FOUND')
