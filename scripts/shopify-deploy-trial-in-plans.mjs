/**
 * Add 7-day trial (₹179) into the live "Choose Your Plan" cards.
 * Theme: 161294057723 (currently main).
 * - Reuses disabled plan_1 slot (old 1-month)
 * - Removes CSS/JS that hid data-plan-index="1"
 * - Points CTA to https://app.lurvox.in/trial
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THEME_ID = Number(process.argv[2] || 161294057723)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const TRIAL_URL = 'https://app.lurvox.in/trial'

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

async function getAsset(key) {
  const data = await api(
    'GET',
    `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`
  )
  return data.asset?.value ?? null
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key, `(${value.length} bytes)`)
}

function patchIndex(indexJson) {
  const data = JSON.parse(indexJson)
  const block =
    data.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh
  if (!block?.settings) {
    throw new Error('Choose Your Plan block ai_gen_block_361650c_qqYKXh not found')
  }
  const s = block.settings
  s.plan_1_enabled = true
  s.plan_1_label = '7-DAY TRIAL'
  s.plan_1_badge = 'ONCE PER PERSON'
  s.plan_1_duration = '7 Days'
  s.plan_1_price = '179'
  s.plan_1_original_price = ''
  s.plan_1_savings = ''
  s.plan_1_monthly = 'All features unlocked'
  s.plan_1_description =
    'Full platform access for 7 days — coach chat, personal plan, trackers, and check-ins. Once per person.'
  s.plan_1_footer = 'Then upgrade to 3 / 6 / 12 months.'
  s.plan_1_link = TRIAL_URL
  s.plan_1_default = false
  s.subheadline =
    'Try 7 days for Rs 179, or pick 3 / 6 / 12 months. Same full coaching on every paid plan.'

  // Soften hide custom-liquid inside home_blocks so plan_1 (trial) is visible
  const hideCl = data.sections?.home_blocks_v2?.blocks?.lurvox_hide_1month_cl
  if (hideCl?.settings?.custom_liquid) {
    hideCl.settings.custom_liquid = `<!-- lurvox-hide-1month-disabled-for-trial-v1 -->
<style id="lurvox-hide-1month-style">
  /* 1-month retired; plan_1 is now the 7-day trial — do not hide */
  [data-plan-index="1"][data-plan-price="999"],
  [data-plan-index="1"][data-plan-price="499"] {
    display: none !important;
  }
</style>
`
  }

  // Ensure standalone trial card stays near plans (end of order is fine; card is backup)
  if (data.sections?.lurvox_trial_card?.settings) {
    data.sections.lurvox_trial_card.settings.price = 'Rs 179'
    data.sections.lurvox_trial_card.settings.cta_url = TRIAL_URL
  }

  return JSON.stringify(data)
}

function patchHideSection(liquid) {
  // Stop blanket-hiding plan index 1
  let out = liquid
  out = out.replace(
    /\[data-plan-index="1"\]\s*\{\s*display:\s*none\s*!important;\s*\}/g,
    `[data-plan-index="1"][data-plan-price="999"],
  [data-plan-index="1"][data-plan-price="499"] { display: none !important; }`
  )
  out = out.replace(
    /document\.querySelectorAll\('\[data-plan-index="1"\]'\)/g,
    `document.querySelectorAll('[data-plan-index="1"][data-plan-price="999"],[data-plan-index="1"][data-plan-price="499"]')`
  )
  out = out.replace(
    /document\.querySelectorAll\("\[data-plan-index=\\"1\\"\]"\)/g,
    `document.querySelectorAll('[data-plan-index="1"][data-plan-price="999"],[data-plan-index="1"][data-plan-price="499"]')`
  )
  if (!out.includes('lurvox-hide-allow-trial-v1')) {
    out =
      `{% comment %} lurvox-hide-allow-trial-v1 — plan_1 may be 7-day trial {% endcomment %}\n` +
      out
  }
  return out
}

async function main() {
  console.log('Patching trial into Choose Your Plan on theme', THEME_ID)

  const indexVal = await getAsset('templates/index.json')
  if (!indexVal) throw new Error('missing templates/index.json')
  await putAsset('templates/index.json', patchIndex(indexVal))

  const hideVal = await getAsset('sections/lurvox-hide-1month.liquid')
  if (hideVal) {
    await putAsset('sections/lurvox-hide-1month.liquid', patchHideSection(hideVal))
  } else {
    console.warn('sections/lurvox-hide-1month.liquid missing')
  }

  // Touch settings_data lightly via index already updated — verify
  const verify = JSON.parse(await getAsset('templates/index.json'))
  const s =
    verify.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh.settings
  console.log('plan_1_enabled=', s.plan_1_enabled)
  console.log('plan_1_duration=', s.plan_1_duration)
  console.log('plan_1_price=', s.plan_1_price)
  console.log('plan_1_link=', s.plan_1_link)
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
