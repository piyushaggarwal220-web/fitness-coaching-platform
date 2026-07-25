/**
 * Finish polish: login section in header, rename theme, verify FAB/prices.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'
const WA =
  'https://wa.me/919220451577?text=I%20have%20doubts%20and%20want%20a%20chat%20before%20payment.'
const CONSULT = '/pages/talk-to-a-coach'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-draft-theme.json'), 'utf8')
)

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

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

async function upsert(files) {
  const data = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId: draft.draftThemeId,
      files: files.map((f) => ({
        filename: f.filename,
        body: { type: 'TEXT', value: f.value },
      })),
    }
  )
  if (data.themeFilesUpsert.userErrors?.length) {
    throw new Error(JSON.stringify(data.themeFilesUpsert.userErrors, null, 2))
  }
  return data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
}

const loginLiquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/lurvox-client-login.liquid'),
  'utf8'
)

const fileData = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      name
      files(filenames: $filenames) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  {
    id: draft.draftThemeId,
    filenames: [
      'sections/header-group.json',
      'sections/footer-group.json',
      'templates/index.json',
    ],
  }
)

const byName = Object.fromEntries(
  fileData.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
)

const header = JSON.parse(stripAutoHeader(byName['sections/header-group.json']))
const footer = JSON.parse(stripAutoHeader(byName['sections/footer-group.json']))
const index = JSON.parse(stripAutoHeader(byName['templates/index.json']))

if (!header.sections.lurvox_client_login) {
  header.sections.lurvox_client_login = {
    type: 'lurvox-client-login',
    settings: {
      enabled: true,
      homepage_only: true,
      prompt: 'Already training with LURVOX?',
      label: 'Existing client? Log in',
      login_url: `${APP}/login`,
      accent_color: '#FF6200',
    },
  }
  // Put login just under announcements / above main header for visibility
  const order = header.order || []
  const annIdx = order.indexOf('header_announcements_9jGBFp')
  if (annIdx >= 0) order.splice(annIdx + 1, 0, 'lurvox_client_login')
  else order.unshift('lurvox_client_login')
  header.order = [...new Set(order)]
} else {
  header.sections.lurvox_client_login.settings = {
    ...header.sections.lurvox_client_login.settings,
    enabled: true,
    homepage_only: true,
    prompt: 'Already training with LURVOX?',
    label: 'Existing client? Log in',
    login_url: `${APP}/login`,
    accent_color: '#FF6200',
  }
}

// Ensure FAB settings explicit
const fabEntry = Object.entries(footer.sections || {}).find(
  ([, s]) => s?.type === 'mobile-floating-bar'
)
if (fabEntry) {
  const [key, fab] = fabEntry
  footer.sections[key].settings = {
    ...fab.settings,
    enabled: true,
    payment_help_url: WA,
    consultation_url: CONSULT,
  }
} else {
  footer.sections.mobile_floating_bar = {
    type: 'mobile-floating-bar',
    settings: {
      enabled: true,
      payment_help_url: WA,
      consultation_url: CONSULT,
      background_color: '#050505',
      accent_color: '#FF6200',
      bottom_spacing: 20,
      border_radius: 24,
      shadow_strength: 100,
    },
  }
  footer.order = [...(footer.order || []), 'mobile_floating_bar']
}

const uploaded = await upsert([
  { filename: 'sections/lurvox-client-login.liquid', value: loginLiquid },
  {
    filename: 'sections/header-group.json',
    value: JSON.stringify(header, null, 2) + '\n',
  },
  {
    filename: 'sections/footer-group.json',
    value: JSON.stringify(footer, null, 2) + '\n',
  },
])
console.log('uploaded:', uploaded.join(', '))

// Verify prices
let prices = null
for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (block?.settings?.plan_1_price) {
      prices = {
        p1: block.settings.plan_1_price,
        p2: block.settings.plan_2_price,
        p3: block.settings.plan_3_price,
        p4: block.settings.plan_4_price,
        cta: block.settings.plan_3_link,
      }
    }
  }
}
console.log('prices:', prices)

const choosePlanLinks = []
for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (block?.settings?.button_text === 'CHOOSE YOUR PLAN') {
      choosePlanLinks.push(block.settings.button_link)
    }
  }
}
console.log('choose_plan_links:', choosePlanLinks)

try {
  const renamed = await gql(
    `mutation themeUpdate($id: ID!, $input: OnlineStoreThemeInput!) {
      themeUpdate(id: $id, input: $input) {
        theme { id name }
        userErrors { field message }
      }
    }`,
    { id: draft.draftThemeId, input: { name: 'LURVOX Draft' } }
  )
  if (renamed.themeUpdate.userErrors?.length) {
    console.log('rename errors:', JSON.stringify(renamed.themeUpdate.userErrors))
  } else {
    console.log('renamed:', renamed.themeUpdate.theme.name)
    fs.writeFileSync(
      path.join(process.env.TEMP, 'shopify-draft-theme.json'),
      JSON.stringify(
        {
          ...draft,
          draftThemeName: renamed.themeUpdate.theme.name,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    )
  }
} catch (e) {
  console.log('rename skipped:', String(e.message || e).slice(0, 180))
}

fs.writeFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/tmp-draft-sections-header-group.json'),
  JSON.stringify(header, null, 2) + '\n'
)
fs.writeFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/tmp-draft-sections-footer-group.json'),
  JSON.stringify(footer, null, 2) + '\n'
)

console.log('done')
