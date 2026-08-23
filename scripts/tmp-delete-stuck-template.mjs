import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const THEME_ID = '161086767355'

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

// Delete stuck compiled template file
const delTpl = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/page.league.json`,
  {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token.access_token },
  }
)
console.log('delete page.league.json', delTpl.status, await delTpl.text())

// Also delete old section to force break of stale compile
const delSec = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=sections/lurvox-league.liquid`,
  {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token.access_token },
  }
)
console.log('delete lurvox-league.liquid', delSec.status, await delSec.text())

await new Promise((r) => setTimeout(r, 3000))

const stuck = await fetch('https://www.lurvox.in/pages/consistency-league', {
  redirect: 'manual',
})
console.log('stuck after delete', {
  status: stuck.status,
  location: stuck.headers.get('location'),
})
if (stuck.status === 200) {
  const html = await stuck.text()
  console.log({
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
  })
}

// Ensure /pages/league still works
const leagueHtml = await fetch('https://www.lurvox.in/pages/league?v=' + Date.now()).then((r) =>
  r.text()
)
console.log('league page', {
  hasBack: leagueHtml.includes('lx-league__back'),
  template: leagueHtml.match(/data-template="([^"]+)"/)?.[1],
})

// Recreate consistency-league page using consistency-league template
const create = await gql(
  `mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }`,
  {
    page: {
      title: 'Consistency League',
      handle: 'consistency-league',
      templateSuffix: 'consistency-league',
      body: '<div style="display:none">Consistency League</div>',
      isPublished: true,
    },
  }
)
console.log('recreate page', JSON.stringify(create.pageCreate, null, 2))

// Remove redirect so page can own the path (or keep redirect to league - prefer one page)
if (create.pageCreate.page) {
  // delete redirect so new page works at that URL
  await fetch(`${REST}/redirects/631842472187.json`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token.access_token },
  })
  console.log('deleted redirect')
}

await new Promise((r) => setTimeout(r, 4000))

const again = await fetch('https://www.lurvox.in/pages/consistency-league?v=' + Date.now()).then(
  (r) => r.text()
)
console.log('consistency-league after recreate', {
  template: again.match(/data-template="([^"]+)"/)?.[1],
  hasBack: again.includes('lx-league__back'),
  sectionIds: [...again.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
})

// Homepage CTA check
const home = await fetch('https://www.lurvox.in/?v=' + Date.now()).then((r) => r.text())
const ctaIdx = home.indexOf('Open the Consistency League')
console.log('cta snippet', home.slice(ctaIdx, ctaIdx + 250))
console.log('WYG highlight snippet', home.slice(home.indexOf('What you get'), home.indexOf('What you get') + 450))
