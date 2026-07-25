import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-draft-theme.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const WA =
  'https://wa.me/919220451577?text=I%20have%20doubts%20and%20want%20a%20chat%20before%20payment.'

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
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const sectionLiquid = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid',
  'utf8'
)

const footerRaw = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: ["sections/footer-group.json"], first: 1) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: draft.draftThemeId }
)

let footerText = footerRaw.theme.files.nodes[0].body.content
const jsonStart = footerText.indexOf('{')
const footer = JSON.parse(footerText.slice(jsonStart))

if (footer.sections.mobile_floating_bar) {
  footer.sections.mobile_floating_bar.settings.payment_help_url = WA
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
    themeId: draft.draftThemeId,
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
