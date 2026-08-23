/**
 * Draft: remove league marketing, add 12-mo weekly coach call,
 * shining white plan prices. Theme 161454620923 only.
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

function buildCompareSection() {
  const rows = [
    ['Personal workout plan', true, true, true],
    ['Personal diet plan', true, true, true],
    ['Daily habit & health trackers', true, true, true],
    ['Coach chat support', true, true, true],
    ['Mid-week + weekly check-ins', true, true, true],
    ['Progress photos & journey', true, true, true],
    ['Weekly plan updates', false, true, true],
    ['Deep plateau-fix coaching', false, true, true],
    ['Lowest monthly rate', false, false, true],
    ['Priority check-ins', false, false, true],
    ['Weekly coach phone call', false, false, true],
  ]
  const blocks = {}
  const block_order = []
  rows.forEach(([feature, plan_3, plan_6, plan_12], i) => {
    const id = `row_${i + 1}`
    blocks[id] = { type: 'row', settings: { feature, plan_3, plan_6, plan_12 } }
    block_order.push(id)
  })
  return {
    type: 'lurvox-plan-compare',
    blocks,
    block_order,
    settings: {
      eyebrow: 'Compare plans',
      headline: 'Pick with the full picture',
      subheadline:
        'Same coaching core on every plan. The 12-month plan adds a weekly coach phone call — not on 3 or 6 months.',
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
  }
}

const files = [
  ['snippets/lurvox-what-you-get.liquid', 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
]

for (const [key, rel] of files) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const tpl = JSON.parse(await get('templates/index.json'))
const section = tpl.sections.home_blocks_v2
const plans = section?.blocks?.ai_gen_block_361650c_qqYKXh?.settings
if (plans) {
  plans.plan_4_footer =
    'Coach calls you every week — 12-month exclusive. Lowest monthly rate. For people going all-in.'
  plans.plan_4_description = 'Complete Transformation'
  // scrub any leftover league strings in plan fields
  for (const [k, v] of Object.entries(plans)) {
    if (typeof v === 'string' && /league|prize money|₹5,?000|Rs\.?\s*5,?000/i.test(v)) {
      plans[k] = v
        .replace(/Crazy League prize money up to ₹5,?000\.?\s*/gi, '')
        .replace(/Consistency League[^.]*\.?\s*/gi, '')
        .replace(/prize money[^.]*\.?\s*/gi, '')
        .trim()
    }
  }
}

// FAQ / other custom liquid blocks: strip league Q&A text in settings
function scrub(obj) {
  if (!obj || typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if (/consistency league|crazy league|prize money|₹5,?000/i.test(v)) {
        if (/what is the consistency league/i.test(v) || /^what is the consistency league/i.test(k)) {
          // replace FAQ question/answer pairs when possible
        }
        if (/league/i.test(k) || /answer_5|question_5|faq_q_5|faq_a_5/i.test(k)) {
          if (/question|faq_q/i.test(k)) {
            obj[k] = 'Does my coach call me?'
          } else if (/answer|faq_a/i.test(k)) {
            obj[k] =
              'On the 12-month plan, your coach calls you every week. Chat check-ins are on every plan; the weekly phone call is 12-month only — not on 3 or 6 months.'
          } else {
            obj[k] = v
              .replace(/Consistency League[^.]*\.?/gi, '')
              .replace(/Crazy League[^.]*\.?/gi, '')
              .replace(/prize money[^.]*\.?/gi, '')
              .trim()
          }
        } else if (/answer_2|feature_10/i.test(k)) {
          obj[k] = v
            .replace(/,?\s*Consistency League/gi, '')
            .replace(/Consistency League included/gi, 'Weekly coach phone call (12-month)')
            .replace(/Monthly ladder[^.]*\.?/gi, 'Weekly phone call with your coach on the 12-month plan.')
            .trim()
        } else {
          obj[k] = v
            .replace(/,?\s*Consistency League/gi, '')
            .replace(/Crazy League[^.]*\.?/gi, '')
            .replace(/prize money up to [^.]+\.?/gi, '')
            .replace(/Open \/pages\/consistency-league[^.]*\.?/gi, '')
            .trim()
        }
      }
    } else if (typeof v === 'object') {
      scrub(v)
    }
  }
}

scrub(section)

// Targeted FAQ fix for common ai_gen FAQ block keys
for (const [id, block] of Object.entries(section.blocks || {})) {
  const s = block.settings || {}
  for (const key of Object.keys(s)) {
    const val = s[key]
    if (typeof val !== 'string') continue
    if (/what is the consistency league/i.test(val)) {
      s[key] = 'Does my coach call me on a call?'
      // try pair answer
      const num = key.match(/(\d+)/)?.[1]
      if (num) {
        for (const ak of [`answer_${num}`, `faq_a_${num}`, `a_${num}`]) {
          if (typeof s[ak] === 'string') {
            s[ak] =
              'Yes — on the 12-month plan your coach calls you every week. 3 and 6 month plans use in-app check-ins and chat; the weekly phone call is 12-month only.'
          }
        }
      }
    }
    if (/consistency-league|Crazy 1|prize-money arena|World Leaderboard/i.test(val)) {
      s[key] =
        'On the 12-month plan, your coach calls you every week. Chat and check-ins are on every plan; the weekly phone call is not included on 3 or 6 months.'
    }
    if (/Consistency League included/i.test(val)) {
      s[key] = 'Weekly coach phone call (12-month)'
    }
    if (/Monthly ladder, top 10%/i.test(val)) {
      s[key] = 'Your coach calls you every week — only on the 12-month plan'
    }
    if (/progress photos\/journey, Consistency League/i.test(val)) {
      s[key] = val.replace(/, Consistency League/gi, '')
    }
  }
}

await put('templates/index.json', JSON.stringify(tpl))

const compareTpl = {
  sections: {
    main: buildCompareSection(),
  },
  order: ['main'],
}
await put('templates/page.compare-plans.json', JSON.stringify(compareTpl, null, 2))

console.log('done')
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=noleague1`)
