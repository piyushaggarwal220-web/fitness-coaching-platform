import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const pages = await fetch(`${REST}/pages.json?handle=consistency-league`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
console.log('pages by handle', pages.pages)

const all = await fetch(`${REST}/pages.json?limit=50`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
console.log(
  'league-ish',
  all.pages.filter((p) => /league|consist/i.test(p.handle) || /league|consist/i.test(p.title))
)

const redirects = await fetch(`${REST}/redirects.json?limit=250`, {
  headers: { 'X-Shopify-Access-Token': token.access_token },
}).then((r) => r.json())
console.log(
  'redirects',
  redirects.redirects.filter((r) => /league|consist/i.test(r.path + r.target))
)

const res = await fetch('https://www.lurvox.in/pages/consistency-league', {
  redirect: 'manual',
  headers: { 'Cache-Control': 'no-cache' },
})
console.log('manual redirect check', {
  status: res.status,
  location: res.headers.get('location'),
  'cf-cache-status': res.headers.get('cf-cache-status'),
})
if (res.status === 200) {
  const html = await res.text()
  console.log({
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    title: html.match(/<title>([^<]+)</)?.[1]?.trim(),
    hasBack: html.includes('lx-league__back'),
  })
}

// Verify index highlight remotely
const index = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const val = index.asset.value
console.log({
  indexHasRewardsFirst: val.includes('REWARDS FIRST'),
  indexCta: val.includes('/pages/league'),
  indexFlat: val.includes('"flat_list": true'),
  highlightSnippet: val.match(/"highlight_text": "([^"]{0,120})/)?.[1],
})

// Homepage live snippet around What you get
const home = await fetch('https://www.lurvox.in/?v=' + Date.now()).then((r) => r.text())
const wyg = home.indexOf('What you get')
console.log('home WYG snippet', home.slice(wyg, wyg + 800))
console.log({
  homeHasCardTitleClassUsed:
    home.includes('ai-what-you-get-cards-') || home.includes('data-card-index'),
  flatDiv: home.includes('ai-what-you-get-flat-'),
  paragraphNear: /What you get[\s\S]{0,400}ai-what-you-get-paragraph/.test(home),
})
