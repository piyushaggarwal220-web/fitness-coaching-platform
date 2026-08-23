/**
 * Keep plan price "Rs 499" on one line and tighten right column.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}
const KEY = 'blocks/ai_gen_block_361650c.liquid'

const MOBILE_CSS = `/* lurvox-mobile-plan-cards-v2 */
  @media screen and (max-width: 749px) {
    .ai-transformation-plan-card-inner-{{ ai_gen_id }} {
      grid-template-columns: minmax(0, 1fr) max-content !important;
      gap: 10px !important;
      align-items: center !important;
    }

    .ai-transformation-plan-card-left-{{ ai_gen_id }} {
      min-width: 0 !important;
      padding-right: 4px !important;
    }

    .ai-transformation-plan-card-right-{{ ai_gen_id }} {
      width: max-content !important;
      max-width: none !important;
      flex-shrink: 0 !important;
      align-items: flex-end !important;
      text-align: right !important;
      flex-direction: column !important;
      flex-wrap: nowrap !important;
      gap: 4px !important;
    }

    .ai-transformation-plan-card-pricing-{{ ai_gen_id }} {
      align-items: flex-end !important;
      text-align: right !important;
    }

    .ai-transformation-plan-card-original-price-{{ ai_gen_id }},
    .ai-transformation-plan-card-price-{{ ai_gen_id }},
    .ai-transformation-plan-card-monthly-{{ ai_gen_id }},
    .ai-transformation-plan-card-savings-{{ ai_gen_id }} {
      text-align: right !important;
      white-space: nowrap !important;
    }

    .ai-transformation-plan-card-price-{{ ai_gen_id }} {
      font-size: 22px !important;
      line-height: 1.1 !important;
    }

    .ai-transformation-plan-card-monthly-{{ ai_gen_id }} {
      font-size: 10px !important;
    }

    .ai-transformation-plan-card-savings-{{ ai_gen_id }} {
      font-size: 9px !important;
      padding: 3px 7px !important;
    }

    .ai-transformation-plan-card-footer-{{ ai_gen_id }} {
      -webkit-line-clamp: unset !important;
      display: block !important;
      overflow: visible !important;
    }
  }
/* /lurvox-mobile-plan-cards-v2 */`

const themes = await (
  await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
).json()
const live = themes.themes.find((t) => t.role === 'main')

const getRes = await fetch(
  `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let block = (await getRes.json()).asset.value

const start = '/* lurvox-mobile-plan-cards-v2 */'
const end = '/* /lurvox-mobile-plan-cards-v2 */'
if (!block.includes(start) || !block.includes(end)) throw new Error('v2 marker missing')
const re = new RegExp(
  start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
)
block = block.replace(re, MOBILE_CSS)

// Prefer non-breaking space between Rs and amount in markup
block = block.replace(
  /(<div class="ai-transformation-plan-card-original-price-\{\{ ai_gen_id \}\}">)Rs \{\{ plan_original_price \}\}/g,
  '$1Rs&nbsp;{{ plan_original_price }}'
)
block = block.replace(
  /(<div class="ai-transformation-plan-card-price-\{\{ ai_gen_id \}\}">)Rs \{\{ plan_price \}\}/g,
  '$1Rs&nbsp;{{ plan_price }}'
)

const put = await fetch(`${REST}/themes/${live.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: block } }),
})
if (!put.ok) throw new Error(`PUT ${put.status} ${(await put.text()).slice(0, 300)}`)

fs.writeFileSync(path.join('scripts', 'tmp-live-plan-block-361650c.liquid'), block)
console.log(
  JSON.stringify(
    {
      themeId: live.id,
      hasNowrap: block.includes('white-space: nowrap'),
      hasNbsp: block.includes('Rs&nbsp;{{ plan_price }}'),
      hasMaxContent: block.includes('max-content'),
    },
    null,
    2
  )
)
