import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MAIN = '188369142011'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${MAIN}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: H }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

async function putAsset(key, value) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          userErrors { field message }
        }
      }`,
      variables: {
        themeId: `gid://shopify/OnlineStoreTheme/${MAIN}`,
        files: [{ filename: key, body: { type: 'TEXT', value } }],
      },
    }),
  })
  const json = await res.json()
  if (json.errors || json.data?.themeFilesUpsert?.userErrors?.length) {
    throw new Error(JSON.stringify(json.errors || json.data.themeFilesUpsert.userErrors))
  }
}

function flexRe(value) {
  return new RegExp(
    value
      .split('\n')
      .map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\r?\\n'),
    'g'
  )
}

function mustReplace(label, text, from, to) {
  if (!flexRe(from).test(text)) {
    if (flexRe(to).test(text)) return text
    throw new Error(`missing ${label}: ${from.slice(0, 120).replace(/\s+/g, ' ')}`)
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  return text.replace(flexRe(from), to.replace(/\n/g, newline))
}

const files = {}
const keys = [
  'templates/index.json',
  'sections/lurvox-plan-finder.liquid',
  'sections/lurvox-plan-finder-v3.liquid',
  'sections/lurvox-ad-landing.liquid',
  'sections/lurvox-cart-builder.liquid',
  'sections/lurvox-cart-builder-v3.liquid',
  'sections/lurvox-plan-compare.liquid',
  'sections/lurvox-hide-1month.liquid',
  'sections/lurvox-home-redesign.liquid',
  'snippets/lurvox-plan-compare-inline.liquid',
  'snippets/lurvox-plan-compare-inline-v999.liquid',
  'snippets/lurvox-conversion-boost.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'layout/theme.liquid',
]
for (const key of keys) files[key] = await getAsset(key)

let index = files['templates/index.json']
index = mustReplace(
  'index 12-month matrix',
  index,
  '12 months<\\/span> <strong>₹1,500<\\/strong>',
  '12 months<\\/span> <strong>₹2,300<\\/strong>'
)
if (!index.includes('[data-plan-price=\\"900\\"]')) {
  index = index.replace(
    '[data-plan-price=\\"3499\\"]',
    '[data-plan-price=\\"3499\\"], [data-plan-price=\\"900\\"], [data-plan-price=\\"1500\\"], [data-plan-price=\\"2300\\"]'
  )
}
files['templates/index.json'] = index

let finder = files['sections/lurvox-plan-finder.liquid']
finder = mustReplace(
  'finder 12 price',
  finder,
  `        label: 'Build Your Dream Physique',
        price: '₹1,500',`,
  `        label: 'Build Your Dream Physique',
        price: '₹2,300',`
)
files['sections/lurvox-plan-finder.liquid'] = finder

let v3 = files['sections/lurvox-plan-finder-v3.liquid']
v3 = mustReplace(
  'v3 upgrade link',
  v3,
  'Prefer Build Your Dream Physique? 12 months · ₹1,500',
  'Prefer Build Your Dream Physique? 12 months · ₹2,300'
)
v3 = mustReplace(
  'v3 12 price',
  v3,
  `        label: 'Build Your Dream Physique',
        price: '₹1,500',`,
  `        label: 'Build Your Dream Physique',
        price: '₹2,300',`
)
files['sections/lurvox-plan-finder-v3.liquid'] = v3

let ad = files['sections/lurvox-ad-landing.liquid']
ad = mustReplace(ad, ad, 'data-value="1299"', 'data-value="900"')
ad = mustReplace(ad, ad, 'data-value="2099"', 'data-value="1500"')
ad = mustReplace(ad, ad, 'data-value="3499"', 'data-value="2300"')
ad = mustReplace(
  'ad 12 price',
  ad,
  '<span class="lx-ad__price">₹1,500 <small>≈ ₹192/mo</small></span>',
  '<span class="lx-ad__price">₹2,300 <small>≈ ₹192/mo</small></span>'
)
ad = mustReplace(ad, ad, 'Start 12-month · ₹1,500', 'Start 12-month · ₹2,300')
ad = ad.replace('See plans — from ₹300/mo', 'See plans — from ₹192/mo')
files['sections/lurvox-ad-landing.liquid'] = ad

function setPlanPaise(text, slug, paise) {
  const re = new RegExp(`(slug: '${slug}'[\\s\\S]*?listPaise:\\s*)\\d+([\\s\\S]*?salePaise:\\s*)\\d+`)
  if (!re.test(text)) throw new Error(`cart plan missing ${slug}`)
  return text.replace(re, `$1${paise}$2${paise}`)
}
function patchCart(text) {
  let next = text
  next = setPlanPaise(next, '3_months', 90000)
  next = setPlanPaise(next, '6_months', 150000)
  next = setPlanPaise(next, '12_months', 230000)
  next = next.split(" + ' · was ' + inr(plan.listPaise)").join('')
  next = next.split("'One-time payment · was ' + inr(plan.listPaise)").join("'One-time payment'")
  return next
}
files['sections/lurvox-cart-builder.liquid'] = patchCart(files['sections/lurvox-cart-builder.liquid'])
files['sections/lurvox-cart-builder-v3.liquid'] = patchCart(files['sections/lurvox-cart-builder-v3.liquid'])

let compare = files['sections/lurvox-plan-compare.liquid']
compare = mustReplace(
  'compare col 3',
  compare,
  '"id": "col_3_price", "label": "Column 3 price", "default": "₹1,500"',
  '"id": "col_3_price", "label": "Column 3 price", "default": "₹2,300"'
)
compare = mustReplace(
  'compare monthlies',
  compare,
  '"plan_3_text": "₹433", "plan_6_text": "₹350", "plan_12_text": "₹292"',
  '"plan_3_text": "₹300", "plan_6_text": "₹250", "plan_12_text": "₹192"'
)
files['sections/lurvox-plan-compare.liquid'] = compare

let hide = files['sections/lurvox-hide-1month.liquid']
if (!hide.includes('[data-plan-price="900"]')) {
  hide = hide.replace(
    '[data-plan-price="3499"] {',
    '[data-plan-price="3499"],\n  [data-plan-price="900"],\n  [data-plan-price="1500"],\n  [data-plan-price="2300"] {'
  )
  hide = hide.replace(
    '/^(999|1699|2999|1499|2699|3999|1299|2099|3499)$/',
    '/^(999|1699|2999|1499|2699|3999|1299|2099|3499|900|1500|2300)$/'
  )
}
files['sections/lurvox-hide-1month.liquid'] = hide

let home = files['sections/lurvox-home-redesign.liquid']
home = mustReplace(
  'home plan 2 monthly',
  home,
  '"id": "plan_2_monthly", "label": "Plan 2 monthly", "default": "≈ ₹192/month"',
  '"id": "plan_2_monthly", "label": "Plan 2 monthly", "default": "≈ ₹300/month"'
)
home = mustReplace(
  'home plan 2 savings',
  home,
  '"id": "plan_2_savings", "label": "Plan 2 savings", "default": "SAVE ₹498"',
  '"id": "plan_2_savings", "label": "Plan 2 savings", "default": "90 days"'
)
home = mustReplace(
  'home plan 3 monthly',
  home,
  '"id": "plan_3_monthly", "label": "Plan 3 monthly", "default": "≈ ₹417/month"',
  '"id": "plan_3_monthly", "label": "Plan 3 monthly", "default": "≈ ₹250/month"'
)
home = mustReplace(
  'home plan 3 savings',
  home,
  '"id": "plan_3_savings", "label": "Plan 3 savings", "default": "SAVE ₹1,295"',
  '"id": "plan_3_savings", "label": "Plan 3 savings", "default": "Save ₹300 vs monthly rate"'
)
home = mustReplace(
  'home plan 4 monthly',
  home,
  '"id": "plan_4_monthly", "label": "Plan 4 monthly", "default": "≈ ₹333/month"',
  '"id": "plan_4_monthly", "label": "Plan 4 monthly", "default": "≈ ₹192/month"'
)
home = mustReplace(
  'home plan 4 savings',
  home,
  '"id": "plan_4_savings", "label": "Plan 4 savings", "default": "SAVE ₹2,989"',
  '"id": "plan_4_savings", "label": "Plan 4 savings", "default": "Save ₹1,300 vs monthly rate"'
)
files['sections/lurvox-home-redesign.liquid'] = home

let inline = files['snippets/lurvox-plan-compare-inline.liquid']
inline = mustReplace(
  'inline 12 price',
  inline,
  `            <small>12 months · ₹192/mo</small>
            <strong>₹1,500</strong>`,
  `            <small>12 months · ₹192/mo</small>
            <strong>₹2,300</strong>`
)
inline = mustReplace(
  'inline monthlies',
  inline,
  `          <td>₹433</td>
          <td>₹350</td>
          <td class="is-featured is-best">₹292</td>`,
  `          <td>₹300</td>
          <td>₹250</td>
          <td class="is-featured is-best">₹192</td>`
)
files['snippets/lurvox-plan-compare-inline.liquid'] = inline

let v999 = files['snippets/lurvox-plan-compare-inline-v999.liquid']
v999 = mustReplace('v999 3', v999, '<strong>₹999</strong>', '<strong>₹900</strong>')
v999 = mustReplace('v999 6', v999, '<strong>₹1,699</strong>', '<strong>₹1,500</strong>')
v999 = mustReplace('v999 12', v999, '<strong>₹2,999</strong>', '<strong>₹2,300</strong>')
files['snippets/lurvox-plan-compare-inline-v999.liquid'] = v999

let boost = files['snippets/lurvox-conversion-boost.liquid']
boost = mustReplace('boost 12', boost, "strongs[2].textContent = '₹1,500';", "strongs[2].textContent = '₹2,300';")
boost = mustReplace(
  'boost rewrite',
  boost,
  `.replace(/₹500/g, '₹433')
          .replace(/₹450/g, '₹350');`,
  `.replace(/₹666/g, '₹300')
          .replace(/₹583/g, '₹250')
          .replace(/₹500/g, '₹192')
          .replace(/₹450/g, '₹250')
          .replace(/₹433/g, '₹300')
          .replace(/₹350/g, '₹250')
          .replace(/₹333/g, '₹300')
          .replace(/₹292/g, '₹192')
          .replace(/₹283/g, '₹250');`
)
files['snippets/lurvox-conversion-boost.liquid'] = boost

let block = files['blocks/ai_gen_block_361650c.liquid']
block = mustReplace('block plan 2', block, '"id": "plan_2_price",\n      "label": "Price",\n      "default": "1299"', '"id": "plan_2_price",\n      "label": "Price",\n      "default": "900"')
block = mustReplace('block plan 3', block, '"id": "plan_3_price",\n      "label": "Price",\n      "default": "2099"', '"id": "plan_3_price",\n      "label": "Price",\n      "default": "1500"')
block = mustReplace('block plan 4', block, '"id": "plan_4_price",\n      "label": "Price",\n      "default": "1500"', '"id": "plan_4_price",\n      "label": "Price",\n      "default": "2300"')
files['blocks/ai_gen_block_361650c.liquid'] = block

const stamp = Date.now()
let layout = files['layout/theme.liquid']
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
files['layout/theme.liquid'] = layout

for (const key of Object.keys(files)) {
  await putAsset(key, files[key])
  console.log('updated', key)
}

const pages = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ query: `{ pages(first: 100) { nodes { id handle body } } }` }),
}).then((r) => r.json())

const pagePairs = [
  ['<strong>3 Months — Quick Reset — ₹999</strong> (≈ ₹333/month · 60% OFF with WELCOME60)', '<strong>3 Months — Quick Reset — ₹900</strong> (≈ ₹300/month)'],
  ['<strong>6 Months — Recomposition Starter — ₹999</strong> (≈ ₹283/month · 60% OFF with WELCOME60)', '<strong>6 Months — Recomposition Starter — ₹1,500</strong> (≈ ₹250/month)'],
  ['<strong>12 Months — Complete Transformation — ₹2,999</strong> (≈ ₹250/month · 60% OFF with WELCOME60)', '<strong>12 Months — Complete Transformation — ₹2,300</strong> (≈ ₹192/month)'],
]
for (const page of pages.data.pages.nodes) {
  let body = page.body || ''
  if (!body.includes('₹999') && !body.includes('₹2,999')) continue
  let next = body
  for (const [from, to] of pagePairs) next = next.split(from).join(to)
  if (next === body) {
    console.log('page unchanged', page.handle)
    continue
  }
  const updated = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      query: `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) { userErrors { field message } }
      }`,
      variables: { id: page.id, page: { body: next } },
    }),
  }).then((r) => r.json())
  if (updated.errors || updated.data?.pageUpdate?.userErrors?.length) {
    throw new Error(JSON.stringify(updated.errors || updated.data.pageUpdate.userErrors))
  }
  console.log('updated page', page.handle)
}

const articles = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `{ articles(first: 50) { nodes { handle title body } } }`,
  }),
}).then((r) => r.json())
const old = ['₹999', '₹1,699', '₹2,999', '₹1,999', '₹3,499', '₹5,999', '₹1,299', '₹2,099']
for (const article of articles.data?.articles?.nodes || []) {
  const blob = `${article.title}\n${article.body || ''}`
  const found = old.filter((n) => blob.includes(n))
  if (found.length) console.log('ARTICLE', article.handle, found.join(', '))
}
console.log('bust', stamp)
