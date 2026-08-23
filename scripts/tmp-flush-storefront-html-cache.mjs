import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    console.log('errors', JSON.stringify(json.errors, null, 2).slice(0, 800))
    throw new Error('gql failed')
  }
  return json.data
}

const before = await gql(`{ onlineStore { passwordProtection { enabled } } }`)
console.log('password before', before.onlineStore.passwordProtection)
// Skip password toggle — too disruptive. Use theme republish dance instead.

// Also try shopUpdate / stale theme republish dance
const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const no1 = themes.themes.nodes.find((t) => t.name.includes('No 1-Month'))
const other = themes.themes.nodes.find(
  (t) => t.role !== 'MAIN' && (t.name.includes('Mobile Home Fix') || t.name.includes('Sale Focus'))
)
console.log(
  'themes',
  themes.themes.nodes.map((t) => `${t.role} ${t.name}`).slice(0, 8)
)
console.log('target', no1?.name, no1?.id, 'temp', other?.name)

if (other && no1) {
  console.log('publishing other briefly...')
  console.log(
    await gql(
      `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
      { id: other.id }
    )
  )
  await new Promise((r) => setTimeout(r, 4000))
  console.log('publishing No 1-Month back...')
  console.log(
    await gql(
      `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
      { id: no1.id }
    )
  )
} else if (no1) {
  console.log('re-publishing No 1-Month')
  console.log(
    await gql(
      `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
      { id: no1.id }
    )
  )
}

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const group = html.match(/sections--(\d+)__/)?.[1]
  const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  const plans = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log(i, {
    group,
    hide: html.includes('lurvox-hide-1month-style'),
    durations,
    plansHas1: /1 Month\s*—/.test(plans),
  })
  if (
    html.includes('lurvox-hide-1month-style') &&
    !durations.includes('1 Month') &&
    !/1 Month\s*—/.test(plans)
  ) {
    console.log('CACHE FLUSHED — ALL CLEAR')
    break
  }
}
