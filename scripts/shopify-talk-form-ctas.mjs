/**
 * Point Talk-to-coach CTAs at the consultation form (email request),
 * not WhatsApp. Improve mobile sizing for sticky + form.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME = 161429127419
const FORM_URL = '/pages/talk-to-a-coach'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await res.text()
  if (!text?.trim()) return null
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    return null
  }
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 400)}`)
  console.log('updated', key)
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.id === THEME)
console.log('theme', main?.role, main?.name)

// --- Local assets: retarget + mobile polish ---
let boost = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
let closer = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-sales-closer.liquid'),
  'utf8'
)
let ad = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-ad-landing.liquid'),
  'utf8'
)
let consult = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)
const template = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'templates-page.talk-to-a-coach.json'),
  'utf8'
)

// Sticky talk → form
boost = boost
  .replace(
    /href="\{\{ wa_url \}\}"\s+target="_blank"\s+rel="noopener noreferrer"\s*\n\s*>\s*\n\s*<span class="lx-conv-sticky__label">Talk to coach<\/span>/,
    `href="${FORM_URL}"\n  >\n    <span class="lx-conv-sticky__label">Talk to coach</span>`
  )
  .replace(
    /class="lx-conv-sticky__talk"\s*\n\s*href="\{\{ wa_url \}\}"\s*\n\s*target="_blank"\s*\n\s*rel="noopener noreferrer"/,
    `class="lx-conv-sticky__talk"\n    href="${FORM_URL}"`
  )

// More reliable sticky block rewrite if regex missed
if (boost.includes('lx-conv-sticky__talk') && boost.includes('wa.me')) {
  boost = boost.replace(
    /<a\s+class="lx-conv-sticky__talk"[\s\S]*?<\/a>/,
    `<a
    class="lx-conv-sticky__talk"
    href="${FORM_URL}"
  >
    <span class="lx-conv-sticky__label">Talk to coach</span>
    <span class="lx-conv-sticky__meta">Book a free call</span>
  </a>`
  )
}

// Mobile sticky polish
if (!boost.includes('lurvox-sticky-mobile-v2')) {
  boost = boost.replace(
    '.lx-conv-sticky {',
    `/* lurvox-sticky-mobile-v2 */\n  .lx-conv-sticky {`
  )
  boost = boost.replace(
    `grid-template-columns: 1.15fr 0.95fr;
    gap: 8px;
    max-width: 440px;`,
    `grid-template-columns: 1.2fr 1fr;
    gap: 8px;
    max-width: min(440px, calc(100vw - 20px));`
  )
  boost = boost.replace(
    `min-height: 54px;
    padding: 9px 10px;
    border-radius: 14px;`,
    `min-height: 52px;
    padding: 8px 8px;
    border-radius: 14px;`
  )
  boost = boost.replace(
    `.lx-conv-sticky__label {
    font-size: 13.5px;`,
    `.lx-conv-sticky__label {
    font-size: 12.5px;`
  )
  boost = boost.replace(
    `.lx-conv-sticky__meta {
    font-size: 11px;`,
    `.lx-conv-sticky__meta {
    font-size: 10.5px;`
  )
  // Keep toast above dual sticky on small phones
  boost = boost.replace(
    'bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;',
    'bottom: calc(78px + env(safe-area-inset-bottom, 0px)) !important;'
  )
}

closer = closer
  .replace(
    /<a href="\{\{ wa_url \}\}" target="_blank" rel="noopener noreferrer" data-funnel="talk_to_coach">WhatsApp a coach<\/a>/,
    `<a href="${FORM_URL}" data-funnel="talk_to_coach">Talk to a coach</a>`
  )
  .replace(
    /Still deciding\?\s*\n\s*<a href="\{\{ wa_url \}\}"[\s\S]*?>WhatsApp a coach<\/a>/,
    `Still deciding?\n    <a href="${FORM_URL}" data-funnel="talk_to_coach">Book a free call</a>`
  )

ad = ad
  .replace(
    /href="\{\{ wa_url \}\}" target="_blank" rel="noopener noreferrer" data-funnel="talk_to_coach"/g,
    `href="${FORM_URL}" data-funnel="talk_to_coach"`
  )
  .replace(/>Talk to a coach</g, '>Book a free call<')

// Mobile form polish
if (!consult.includes('lurvox-consult-mobile-v2')) {
  consult = consult.replace(
    '#lx-consult-{{ section.id }} {',
    `/* lurvox-consult-mobile-v2 */\n  #lx-consult-{{ section.id }} {`
  )
  consult = consult.replace(
    'padding: clamp(36px, 6vw, 72px) 0 clamp(48px, 8vw, 88px);',
    'padding: clamp(20px, 4vw, 72px) 12px clamp(28px, 6vw, 88px);'
  )
  consult = consult.replace(
    'font-size: clamp(1.85rem, 4.2vw, 2.65rem);',
    'font-size: clamp(1.55rem, 6.2vw, 2.65rem);'
  )
  consult = consult.replace(
    'font-size: 1.05rem;\n    line-height: 1.55;\n    color: var(--lx-muted);',
    'font-size: clamp(0.95rem, 3.4vw, 1.05rem);\n    line-height: 1.5;\n    color: var(--lx-muted);'
  )
  consult = consult.replace(
    'padding: clamp(18px, 3vw, 28px);',
    'padding: clamp(14px, 3vw, 28px);'
  )
  consult = consult.replace(
    'padding: 13px 14px;',
    'padding: 14px 14px;\n    min-height: 48px;\n    font-size: 16px;'
  )
  consult = consult.replace(
    '.lx-consult__submit {\n    display: block;\n    width: 100%;\n    margin: 0 0 12px;\n    padding: 15px 18px;\n    border: none;\n    border-radius: 999px;',
    `.lx-consult__submit {\n    display: block;\n    width: 100%;\n    margin: 0 0 12px;\n    padding: 16px 18px;\n    min-height: 52px;\n    border: none;\n    border-radius: 14px;`
  )
  // Stack comfort + avoid iOS zoom
  if (!consult.includes('input, textarea { font-size: 16px')) {
    consult = consult.replace(
      '</style>',
      `
  @media (max-width: 639px) {
    #lx-consult-{{ section.id }} .lx-consult__inner {
      max-width: 100%;
      padding: 0;
    }
    #lx-consult-{{ section.id }} .lx-consult__form {
      border-radius: 14px;
    }
    #lx-consult-{{ section.id }} .lx-consult__field input,
    #lx-consult-{{ section.id }} .lx-consult__field textarea {
      font-size: 16px;
    }
  }
</style>`
    )
  }
}

fs.writeFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-conversion-boost.liquid'),
  boost
)
fs.writeFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-sales-closer.liquid'),
  closer
)
fs.writeFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-ad-landing.liquid'),
  ad
)
fs.writeFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-talk-to-coach.liquid'),
  consult
)

await putAsset('snippets/lurvox-conversion-boost.liquid', boost)
await putAsset('snippets/lurvox-sales-closer.liquid', closer)
await putAsset('sections/lurvox-ad-landing.liquid', ad)
await putAsset('sections/lurvox-talk-to-coach.liquid', consult)
await putAsset('templates/page.talk-to-a-coach.json', template)

// Hero CTA on live theme
let hero = await getAsset('blocks/ai_gen_block_52353f6.liquid')
if (hero) {
  hero = hero.replace(
    /href="https:\/\/wa\.me\/919220451577[^"]*"\s+target="_blank"\s+rel="noopener noreferrer"\s*>\s*Talk to a coach\s*</,
    `href="${FORM_URL}">Talk to a coach<`
  )
  hero = hero.replace(
    /href="https:\/\/wa\.me\/919220451577[^"]*"[^>]*>\s*Talk to a coach\s*</,
    `href="${FORM_URL}">Talk to a coach<`
  )
  await putAsset('blocks/ai_gen_block_52353f6.liquid', hero)
  fs.writeFileSync(
    path.join(__dirname, 'tmp-offer-copy-draft', 'blocks__ai_gen_block_52353f6.liquid'),
    hero
  )
}

// Ensure page uses talk-to-a-coach template
const pages = await gql(`{
  pages(first: 50) {
    nodes { id handle title templateSuffix }
  }
}`)
const talk = pages.pages.nodes.find((p) => p.handle === 'talk-to-a-coach')
if (talk) {
  const updated = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      id: talk.id,
      page: {
        templateSuffix: 'talk-to-a-coach',
        isPublished: true,
        title: 'Book a free consultation call',
      },
    }
  )
  console.log('page', updated.pageUpdate)
} else {
  const created = await gql(
    `mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title: 'Book a free consultation call',
        handle: 'talk-to-a-coach',
        templateSuffix: 'talk-to-a-coach',
        body: '<p>Book a free consultation with a LURVOX coach.</p>',
        isPublished: true,
      },
    }
  )
  console.log('created', created.pageCreate)
}

console.log(
  JSON.stringify(
    {
      form: 'https://www.lurvox.in/pages/talk-to-a-coach',
      emailTo: 'TALK_TO_COACH_NOTIFY_EMAIL or piyushfitness44@gmail.com',
    },
    null,
    2
  )
)
