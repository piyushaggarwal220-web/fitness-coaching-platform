import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
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
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

function probe(html) {
  return {
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('lurvox_hide_1month'),
    trialCard: html.includes('data-plan-price="179"'),
  }
}

async function fetchHome() {
  const r = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile', 'Cache-Control': 'no-cache' },
  })
  return r.text()
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const spare = themes.themes.nodes.find(
  (t) => t.role !== 'MAIN' && (t.name.includes('No 1-Month') || t.name.includes('LURVOX Draft'))
)
console.log('MAIN:', main.name, main.id)
console.log('spare:', spare?.name, spare?.id)
console.log('BEFORE', probe(await fetchHome()))

if (!spare) throw new Error('No spare theme to bounce publish through')

console.log('\nPublishing spare briefly...')
const off = await gql(
  `mutation($id: ID!) { themePublish(id: $id) { theme { name role } userErrors { field message } } }`,
  { id: spare.id }
)
console.log(JSON.stringify(off))
await new Promise((r) => setTimeout(r, 5000))

console.log('Publishing New changes back...')
const on = await gql(
  `mutation($id: ID!) { themePublish(id: $id) { theme { name role } userErrors { field message } } }`,
  { id: main.id }
)
console.log(JSON.stringify(on))

console.log('\nPolling homepage cache...')
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const p = probe(await fetchHome())
  console.log(i, p)
  if (p.stamp && !p.showTrialPlan && !p.hideSection) {
    console.log('\nCACHE FLUSHED')
    process.exit(0)
  }
}

console.log('\nCache still stale after polling')
process.exit(1)
