import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

const queries = [
  `{ themes(first: 20) { nodes { id name role } } }`,
  `{ markets(first: 20) { nodes { id name handle status primary } } }`,
  `{
    onlineStore {
      passwordProtection { enabled }
    }
  }`,
]

for (const q of queries) {
  const r = await gql(q)
  console.log(JSON.stringify(r, null, 2).slice(0, 1500))
  console.log('---')
}

// Check if index has CTA markup still (hidden) vs gone
const html = await (
  await fetch('https://www.lurvox.in/index?x=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126' },
  })
).text()
console.log({
  ctaInDom: /data-cta-button/.test(html),
  ctaDisplayNone: html.includes('ai-transformation-plan-cta-wrapper') && html.includes('display: none'),
  cardClick: html.includes('goToPlan') || html.includes('lurvoxTapWired'),
  sampleCta: (() => {
    const i = html.indexOf('data-cta-button')
    return i < 0 ? null : html.slice(i - 30, i + 80)
  })(),
})
