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
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

function probe(html) {
  return {
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('__lurvox_hide_1month'),
    stabilize: html.includes('lurvox-stabilize-trial'),
    trialCard: html.includes('data-plan-price="179"'),
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    themeName: html.match(/"name":"([^"]+)","id":\d+/)?.[1],
  }
}

async function home() {
  return (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('current MAIN', main)
console.log('BEFORE', probe(await home()))

const name = `New changes stable ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
console.log('\nDuplicating as', name)
const dup = await gql(
  `mutation($id: ID!, $name: String!) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: main.id, name }
)
console.log(JSON.stringify(dup, null, 2))
const newTheme = dup.themeDuplicate?.newTheme
if (!newTheme?.id) throw new Error('duplicate failed')

console.log('\nPublishing duplicate...')
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: newTheme.id }
)
console.log(JSON.stringify(pub, null, 2))

console.log('\nPolling homepage...')
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const p = probe(await home())
  console.log(i, p)
  if (p.themeId === newTheme.id.split('/').pop() && !p.showTrialPlan && p.trialCard) {
    console.log('\nLIVE ON NEW THEME WITHOUT FLICKER SCRIPT')
    process.exit(0)
  }
  if (!p.showTrialPlan && p.trialCard && p.stabilize) {
    console.log('\nFLICKER GONE')
    process.exit(0)
  }
}

console.log('\nNot confirmed clean yet — check manually')
process.exit(1)
