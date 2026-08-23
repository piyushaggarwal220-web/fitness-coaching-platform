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

const footer = await get('sections/footer-group.json')
const fab = JSON.parse(footer)
function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'mobile-floating-bar' || node.settings?.consultation_url) {
    out.push({
      type: node.type,
      consultation_url: node.settings?.consultation_url,
      consultation_label: node.settings?.consultation_label,
      payment_help_url: node.settings?.payment_help_url,
    })
  }
  for (const v of Object.values(node)) walk(v, out)
  return out
}
console.log('footer fab settings', walk(fab))

const layout = await get('layout/theme.liquid')
const section = await get('sections/lurvox-talk-to-coach.liquid')
console.log({
  layoutClean: !layout.includes('lurvox-talk-form-override') && !layout.includes('How can we help'),
  sectionReady: section.includes('lx-consult__form') && section.includes('₹2,499'),
})
