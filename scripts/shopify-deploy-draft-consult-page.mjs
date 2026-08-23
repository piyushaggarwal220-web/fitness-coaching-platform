/**
 * Draft-only: on-site consultation page + CTA wiring
 * Theme: Copy of Copy of LURVOX Price Review… (161294057723)
 *
 * - Professional /pages/talk-to-a-coach with form + plan prices
 * - Remove WhatsApp path hijack in layout
 * - Point consultation CTAs to the on-site page
 * Does NOT publish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161294057723)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const CONSULT_PATH = '/pages/talk-to-a-coach'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${urlPath}: ${res.status} ${text.slice(0, 500)}`)
  return json
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key)
}

async function getAsset(key) {
  const data = await api(
    'GET',
    `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`
  )
  return data.asset?.value ?? null
}

function readLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function stripWaPathRedirect(layout) {
  const start = '{%- comment -%} lurvox-talk-path-redirect-v2 {%- endcomment -%}'
  const end = '{%- comment -%} /lurvox-talk-path-redirect-v2 {%- endcomment -%}'
  const a = layout.indexOf(start)
  const b = layout.indexOf(end)
  if (a >= 0 && b > a) {
    return layout.slice(0, a) + layout.slice(b + end.length)
  }
  // Fallback: remove any hard WA replace for talk pages
  return layout.replace(
    /if\s*\(\s*path\s*===\s*'\/pages\/talk-coach'[\s\S]*?window\.location\.replace\(\s*"https:\/\/wa\.me[^"]*"\s*\);\s*\}/g,
    'if (false) { /* lurvox: keep talk pages on-site */ }'
  )
}

function patchConsultUrls(raw) {
  let out = raw
  try {
    const json = JSON.parse(raw)
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      if (node.settings && typeof node.settings === 'object') {
        const s = node.settings
        if ('consultation_url' in s || 'consultation_label' in s) {
          s.consultation_url = CONSULT_PATH
          if ('consultation_label' in s) {
            s.consultation_label = 'Book a free consultation call with a coach'
          }
        }
        // Common CTA url fields that point at WhatsApp consultation
        for (const key of Object.keys(s)) {
          const val = s[key]
          if (typeof val !== 'string') continue
          if (/wa\.me\/919220451577/i.test(val) && /consult|coach|talk/i.test(val + key)) {
            s[key] = CONSULT_PATH
          }
        }
      }
      Object.values(node).forEach(walk)
    }
    walk(json)
    out = JSON.stringify(json)
  } catch {
    out = raw
      .replace(
        /https:\\\/\\\/wa\.me\\\/919220451577\?text=[^"]*consultation[^"]*/gi,
        CONSULT_PATH
      )
      .replace(
        /https:\/\/wa\.me\/919220451577\?text=[^"&\s]*consultation[^"&\s]*/gi,
        CONSULT_PATH
      )
  }
  return out
}

async function ensureTalkPage() {
  const existing = await gql(`{
    pages(first: 20, query: "handle:talk-to-a-coach OR handle:talk-coach") {
      nodes { id handle title templateSuffix isPublished }
    }
  }`)
  const nodes = existing.pages?.nodes || []
  let page = nodes.find((p) => p.handle === 'talk-to-a-coach')

  if (!page) {
    const create = await gql(
      `mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id handle templateSuffix isPublished }
          userErrors { field message }
        }
      }`,
      {
        page: {
          title: 'Book a free consultation call',
          handle: 'talk-to-a-coach',
          templateSuffix: 'talk-to-a-coach',
          body: '',
          isPublished: true,
        },
      }
    )
    if (create.pageCreate.userErrors?.length) {
      throw new Error('pageCreate: ' + JSON.stringify(create.pageCreate.userErrors))
    }
    page = create.pageCreate.page
    console.log('created page', page)
  } else {
    const update = await gql(
      `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle templateSuffix title isPublished }
          userErrors { field message }
        }
      }`,
      {
        id: page.id,
        page: {
          title: 'Book a free consultation call',
          templateSuffix: 'talk-to-a-coach',
          isPublished: true,
        },
      }
    )
    if (update.pageUpdate.userErrors?.length) {
      throw new Error('pageUpdate: ' + JSON.stringify(update.pageUpdate.userErrors))
    }
    page = update.pageUpdate.page
    console.log('updated page', page)
  }

  // Also point talk-coach at the same template for old links
  const talkCoach = nodes.find((p) => p.handle === 'talk-coach')
  if (talkCoach) {
    const update = await gql(
      `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle templateSuffix }
          userErrors { field message }
        }
      }`,
      {
        id: talkCoach.id,
        page: { templateSuffix: 'talk-to-a-coach', isPublished: true },
      }
    )
    console.log('talk-coach template', update.pageUpdate.page, update.pageUpdate.userErrors)
  }

  return page
}

async function main() {
  const theme = await api('GET', `/themes/${THEME_ID}.json`)
  console.log('Target theme:', theme.theme?.id, theme.theme?.name, theme.theme?.role)
  if (!String(theme.theme?.name || '').toLowerCase().includes('copy of copy of')) {
    console.warn('WARNING: theme name does not look like the requested draft')
  }

  await putAsset(
    'sections/lurvox-talk-to-coach.liquid',
    readLocal('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid')
  )
  await putAsset(
    'templates/page.talk-to-a-coach.json',
    readLocal('scripts/shopify-assets/templates-page.talk-to-a-coach.json')
  )

  // Keep floating bar default path on-site (not WhatsApp)
  try {
    let fab = await getAsset('sections/mobile-floating-bar.liquid')
    if (fab) {
      fab = fab.replace(
        /assign consult_url = 'https:\/\/wa\.me[^']*'/g,
        `assign consult_url = '${CONSULT_PATH}'`
      )
      if (!fab.includes("assign consult_url = '/pages/talk-to-a-coach'")) {
        fab = fab.replace(
          /if consult_url == blank\s*\n\s*assign consult_url = '[^']*'/,
          `if consult_url == blank\n    assign consult_url = '${CONSULT_PATH}'`
        )
      }
      await putAsset('sections/mobile-floating-bar.liquid', fab)
    }
  } catch (err) {
    console.warn('fab patch skip', err.message)
  }

  let layout = await getAsset('layout/theme.liquid')
  if (!layout) throw new Error('layout/theme.liquid missing')
  const cleaned = stripWaPathRedirect(layout)
  if (cleaned !== layout) {
    await putAsset('layout/theme.liquid', cleaned)
    console.log('removed WhatsApp talk-page redirect from layout')
  } else {
    console.log('layout: no WA talk redirect block found (or already removed)')
  }

  for (const key of [
    'templates/index.json',
    'templates/index.home-redesign.json',
    'sections/footer-group.json',
    'sections/header-group.json',
  ]) {
    try {
      const raw = await getAsset(key)
      if (!raw) continue
      const patched = patchConsultUrls(raw)
      if (patched !== raw) {
        await putAsset(key, patched)
      } else {
        console.log('no consult url changes in', key)
      }
    } catch (err) {
      console.warn('patch skip', key, err.message)
    }
  }

  await ensureTalkPage()

  const previewHome = `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`
  const previewPage = `https://www.lurvox.in/pages/talk-to-a-coach?preview_theme_id=${THEME_ID}`
  console.log('\nDONE — draft only, not published')
  console.log('Preview home:', previewHome)
  console.log('Preview consult page:', previewPage)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
