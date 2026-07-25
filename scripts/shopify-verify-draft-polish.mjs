import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-draft-theme.json'), 'utf8')
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

const data = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      name
      role
      files(filenames: [
        "sections/footer-group.json",
        "sections/mobile-floating-bar.liquid",
        "sections/header-group.json"
      ]) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
    pages(first: 30) {
      nodes { handle body }
    }
  }`,
  { id: draft.draftThemeId }
)

console.log('theme', data.theme.name, data.theme.role)

for (const n of data.theme.files.nodes) {
  const c = n.body?.content || ''
  if (n.filename.includes('footer')) {
    const fab = JSON.parse(c.replace(/^\/\*[\s\S]*?\*\//, '')).sections
    const entry = Object.values(fab).find((s) => s.type === 'mobile-floating-bar')
    console.log('fab urls set', {
      payment: Boolean(entry?.settings?.payment_help_url),
      consult: entry?.settings?.consultation_url,
    })
  }
  if (n.filename.includes('mobile-floating')) {
    console.log('hide consult page', c.includes('talk-to-a-coach'))
    console.log('wa default', c.includes('wa.me/919220451577'))
  }
  if (n.filename.includes('header')) {
    console.log('client login wired', c.includes('lurvox-client-login'))
  }
}

const plans = data.pages.nodes.find((p) => p.handle === 'plans')
if (plans) {
  console.log('plans app checkout', /app\.lurvox\.in\/checkout/.test(plans.body || ''))
  console.log('plans still has rzp', /rzp\.io/i.test(plans.body || ''))
}
