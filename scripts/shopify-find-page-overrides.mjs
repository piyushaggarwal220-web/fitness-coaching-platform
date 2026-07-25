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
console.log('MAIN', main.name, main.id)

// List all page templates via files search - GraphQL filenames filter
const candidates = [
  'templates/page.json',
  'templates/page.policy.json',
  'templates/page.contact.json',
  'templates/page.plans.json',
  'templates/page.privacy-policy.json',
  'templates/page.terms-and-conditions.json',
  'templates/page.refund-and-cancellation-policy.json',
  'templates/page.shipping-policy.json',
  'templates/page.about-us.json',
  'templates/page.pricing.json',
  'templates/page.default.json',
]

const files = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id, filenames: candidates }
)

for (const n of files.theme.files.nodes) {
  const raw = (n.body?.content || '').replace(/^\/\*[\s\S]*?\*\//, '').trim()
  if (!raw) {
    console.log(n.filename, 'EMPTY or binary')
    continue
  }
  try {
    const j = JSON.parse(raw)
    const hasPlan = JSON.stringify(j).includes('361650c') || JSON.stringify(j).includes('plan_1_price')
    console.log(
      n.filename,
      'sections=',
      Object.keys(j.sections || {}).join(','),
      'hasPlan=',
      hasPlan,
      'mainDisabled=',
      j.sections?.main?.disabled
    )
  } catch {
    console.log(n.filename, 'not json', raw.slice(0, 80))
  }
}

const url = 'https://www.lurvox.in/pages/privacy-policy'
const res = await fetch(url, {
  headers: {
    'Cache-Control': 'no-cache',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
})
const html = await res.text()
console.log('\nHTTP', res.status)
console.log('headers theme', res.headers.get('x-shopify-stage'), res.headers.get('link'))
console.log('journey', html.includes('Choose The Journey'))
console.log('privacy', html.includes('This Privacy Policy explains'))
// Find which section ids appear
const sectionIds = [...html.matchAll(/data-section-id="([^"]+)"/g)].map((m) => m[1])
console.log('section ids sample', [...new Set(sectionIds)].slice(0, 20))
const shopifySection = [...html.matchAll(/shopify-section-([a-zA-Z0-9_-]+)/g)].map((m) => m[1])
console.log('shopify-section classes', [...new Set(shopifySection)].slice(0, 30))
