/**
 * Draft theme: remove hyphens / dashes from customer-facing copy.
 * Theme 161454620923 only. Skips URLs, liquid tags, CSS, comments where possible.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`get ${key}: ${res.status}`)
  return json.asset.value
}

/** Scrub dashes from marketing prose (not URLs / code). */
export function scrubProse(input) {
  if (typeof input !== 'string' || !input) return input
  // leave pure URLs / paths alone
  if (/^(https?:\/\/|\/[a-z0-9#?&=._-]+$)/i.test(input.trim()) && !/\s/.test(input)) {
    return input
  }
  let s = input
  // em / en dashes
  s = s.replace(/\u2014/g, '. ')
  s = s.replace(/\u2013/g, ' to ')
  // spaced ASCII hyphen used as a dash
  s = s.replace(/(\w)\s+-\s+(\w)/g, '$1. $2')
  // common hyphenated marketing words
  s = s.replace(/Mid-week/gi, 'Mid week')
  s = s.replace(/check-ins/gi, 'check ins')
  s = s.replace(/check-in/gi, 'check in')
  s = s.replace(/ghar-ka-khana/gi, 'ghar ka khana')
  s = s.replace(/plateau-fix/gi, 'plateau fix')
  s = s.replace(/non-refundable/gi, 'non refundable')
  s = s.replace(/all-in/gi, 'all in')
  s = s.replace(/all-access/gi, 'all access')
  s = s.replace(/(\d+)\s*-\s*day/gi, '$1 day')
  s = s.replace(/(\d+)\s*-\s*month/gi, '$1 month')
  s = s.replace(/(\d+)\s*-\s*months/gi, '$1 months')
  s = s.replace(/90-DAY/g, '90 DAY')
  s = s.replace(/12-MONTH/g, '12 MONTH')
  s = s.replace(/6-MONTH/g, '6 MONTH')
  s = s.replace(/3-MONTH/g, '3 MONTH')
  // number ranges with ascii hyphen: 24-48
  s = s.replace(/(\d+)\s*-\s*(\d+)/g, '$1 to $2')
  // tidy leftover double spaces / ". ."
  s = s.replace(/\.\s*\./g, '.')
  s = s.replace(/\s{2,}/g, ' ')
  s = s.replace(/\s+\./g, '.')
  // capitalize letter after ". " when previous was em-dash style
  s = s.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)
  return s.trimEnd()
}

function scrubJsonStrings(node, stats) {
  if (typeof node === 'string') {
    const next = scrubProse(node)
    if (next !== node) stats.changed += 1
    return next
  }
  if (Array.isArray(node)) return node.map((x) => scrubJsonStrings(x, stats))
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      // skip keys that are usually technical
      if (/^(type|id|url|link|href|src|image|logo|color|scheme|font|css)/i.test(k) && typeof v === 'string') {
        // still scrub if it looks like a sentence with dashes
        if (/[—–]| - |\d-\d|Mid-week|check-in|month|day/.test(v) && /\s/.test(v)) {
          out[k] = scrubJsonStrings(v, stats)
        } else {
          out[k] = v
        }
      } else {
        out[k] = scrubJsonStrings(v, stats)
      }
    }
    return out
  }
  return node
}

/** Scrub only text nodes-ish content inside liquid: between tags, and default:"..." / >text< */
function scrubLiquidVisible(source) {
  let out = source
  // HTML text between tags
  out = out.replace(/>([^<]*[\u2014\u2013-][^<]*)</g, (m, text) => {
    // skip if looks like only CSS/code
    if (/[{};]|--|==|rgb\(|#[0-9a-fA-F]{3,8}/.test(text)) return m
    return `>${scrubProse(text)}<`
  })
  // schema / setting defaults
  out = out.replace(/("default"\s*:\s*")((?:\\.|[^"\\])*)(")/g, (_, a, val, c) => {
    return a + scrubProse(val.replace(/\\"/g, '"')).replace(/"/g, '\\"') + c
  })
  // liquid default: '...'
  out = out.replace(/(default:\s*')([^']*)(')/g, (_, a, val, c) => a + scrubProse(val) + c)
  out = out.replace(/(default:\s*")([^"]*)(")/g, (_, a, val, c) => a + scrubProse(val) + c)
  return out
}

// --- local files that power the draft ---
const localFiles = [
  ['snippets/lurvox-what-you-get.liquid', 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['sections/lurvox-how-it-works.liquid', 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['sections/lurvox-talk-to-coach.liquid', 'scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'],
]

for (const [key, rel] of localFiles) {
  const abs = path.join(ROOT, rel)
  let raw = fs.readFileSync(abs, 'utf8')
  const scrubbed = scrubLiquidVisible(raw)
  fs.writeFileSync(abs, scrubbed)
  await put(key, scrubbed)
}

// plan card block (footers live partly in liquid defaults + theme JSON)
{
  const key = 'blocks/ai_gen_block_361650c.liquid'
  let raw = await get(key)
  raw = scrubLiquidVisible(raw)
  await put(key, raw)
}

// theme JSON templates: scrub all prose strings
const jsonKeys = [
  'templates/index.json',
  'templates/page.compare-plans.json',
  'templates/page.how-lurvox-works.json',
  'templates/page.find-your-plan.json',
  'templates/page.talk-to-a-coach.json',
]

for (const key of jsonKeys) {
  try {
    const raw = await get(key)
    const stats = { changed: 0 }
    const data = scrubJsonStrings(JSON.parse(raw), stats)
    await put(key, key.endsWith('index.json') ? JSON.stringify(data) : JSON.stringify(data, null, 2))
    console.log('scrubbed', key, 'fields', stats.changed)
  } catch (e) {
    console.log('skip', key, e.message.slice(0, 120))
  }
}

// plan compare features on compare page rebuilt clean
const compareRows = [
  ['Personal workout plan', true, true, true],
  ['Personal diet plan', true, true, true],
  ['Daily habit and health trackers', true, true, true],
  ['Coach chat support', true, true, true],
  ['Mid week + weekly checkins', true, true, true],
  ['Progress photos and journey', true, true, true],
  ['Weekly plan updates', false, true, true],
  ['Deep plateau fix coaching', false, true, true],
  ['Lowest monthly rate', false, false, true],
  ['Priority checkins', false, false, true],
  ['Weekly coach phone call', false, false, true],
]
const blocks = {}
const block_order = []
compareRows.forEach(([feature, plan_3, plan_6, plan_12], i) => {
  const id = `row_${i + 1}`
  blocks[id] = { type: 'row', settings: { feature, plan_3, plan_6, plan_12 } }
  block_order.push(id)
})
await put(
  'templates/page.compare-plans.json',
  JSON.stringify(
    {
      sections: {
        main: {
          type: 'lurvox-plan-compare',
          blocks,
          block_order,
          settings: {
            eyebrow: 'Compare plans',
            headline: 'Pick with the full picture',
            subheadline:
              'Same coaching core on every plan. The 12 month plan adds a weekly coach phone call. Not on 3 or 6 months.',
            col_1_label: '3 MONTHS',
            col_1_price: '₹999',
            col_1_link: 'https://app.lurvox.in/checkout?plan=3_months&code=WELCOME60',
            col_2_label: '6 MONTHS',
            col_2_price: '₹1,699',
            col_2_link: 'https://app.lurvox.in/checkout?plan=6_months&code=WELCOME60',
            col_3_label: '12 MONTHS',
            col_3_price: '₹2,999',
            col_3_link: 'https://app.lurvox.in/checkout?plan=12_months&code=WELCOME60',
            find_url: '/pages/find-your-plan',
            home_url: '/#plans',
          },
        },
      },
      order: ['main'],
    },
    null,
    2
  )
)

console.log('done')
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=nohyphen1`)
