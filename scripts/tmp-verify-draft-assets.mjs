import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  ).then((r) => r.json())
  return j.asset?.value || ''
}

const section = await get('sections/lurvox-talk-to-coach.liquid')
const layout = await get('layout/theme.liquid')
const footer = await get('sections/footer-group.json')
const index = await get('templates/index.json')

console.log({
  sectionHasNewForm: section.includes('lx-consult__form'),
  sectionHasPlans: section.includes('₹2,499'),
  layoutHasWaRedirect: /window\.location\.replace\(\s*["']https:\/\/wa\.me/i.test(layout),
  footerConsult: [...footer.matchAll(/"consultation_url"\s*:\s*"([^"]*)"/g)].map((m) => m[1]),
  indexConsult: [...index.matchAll(/"consultation_url"\s*:\s*"([^"]*)"/g)].map((m) => m[1]),
  indexWaConsult: (index.match(/wa\.me\/919220451577[^"]*consultation[^"]*/gi) || []).length,
})
