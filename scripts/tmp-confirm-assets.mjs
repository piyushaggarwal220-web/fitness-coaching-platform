import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const layout = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

console.log({
  layoutHasScript: layout.asset.value.includes('ensureLeagueBack'),
  layoutUpdated: layout.asset.updated_at,
  snippet: layout.asset.value.slice(
    layout.asset.value.indexOf('ensureLeagueBack') - 80,
    layout.asset.value.indexOf('ensureLeagueBack') + 120
  ),
})

const index = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
console.log({
  indexUpdated: index.asset.updated_at,
  hasSee: index.asset.value.includes('See the Consistency League'),
  hasLeagueUrl: index.asset.value.includes('pages/league'),
  hasRewardsFirst: index.asset.value.includes('REWARDS FIRST'),
})
