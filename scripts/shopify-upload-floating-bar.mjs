import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-draft-theme.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const THEME_ID = draft.draftThemeId

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
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const sectionLiquid = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid',
  'utf8'
)

let footerGroup = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-draft-sections-footer-group.json',
  'utf8'
)

// Strip Shopify auto-generated comment if present for parsing
const jsonStart = footerGroup.indexOf('{')
const footer = JSON.parse(footerGroup.slice(jsonStart))

footer.sections.mobile_floating_bar = {
  type: 'mobile-floating-bar',
  settings: {
    enabled: true,
    payment_help_url: '',
    consultation_url: '',
    background_color: '#050505',
    accent_color: '#FF6200',
    bottom_spacing: 20,
    border_radius: 24,
    shadow_strength: 100,
  },
}

if (!footer.order.includes('mobile_floating_bar')) {
  footer.order.push('mobile_floating_bar')
}

const footerOut =
  `/*\n * ------------------------------------------------------------\n * IMPORTANT: The contents of this file are auto-generated.\n *\n * This file may be updated by the Shopify admin theme editor\n * or related systems. Please exercise caution as any changes\n * made to this file may be overwritten.\n * ------------------------------------------------------------\n */\n` +
  JSON.stringify(footer, null, 2) +
  '\n'

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: THEME_ID,
    files: [
      {
        filename: 'sections/mobile-floating-bar.liquid',
        body: { type: 'TEXT', value: sectionLiquid },
      },
      {
        filename: 'sections/footer-group.json',
        body: { type: 'TEXT', value: footerOut },
      },
    ],
  }
)

console.log(JSON.stringify(data, null, 2))
console.log('THEME', draft.draftThemeName, THEME_ID)
