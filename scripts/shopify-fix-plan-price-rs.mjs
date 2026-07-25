/**
 * Plan cards: keep prices right-aligned on mobile, use "Rs" instead of ₹.
 * Updates live main theme.
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

const BLOCK_KEY = 'blocks/ai_gen_block_361650c.liquid'
const INDEX_KEY = 'templates/index.json'

const MOBILE_CSS = `/* lurvox-mobile-plan-cards-v2 */
  @media screen and (max-width: 749px) {
    .ai-transformation-plan-card-inner-{{ ai_gen_id }} {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 12px !important;
      align-items: center !important;
    }

    .ai-transformation-plan-card-right-{{ ai_gen_id }} {
      width: auto !important;
      max-width: 42% !important;
      align-items: flex-end !important;
      text-align: right !important;
      flex-direction: column !important;
      flex-wrap: nowrap !important;
      gap: 6px !important;
    }

    .ai-transformation-plan-card-pricing-{{ ai_gen_id }} {
      align-items: flex-end !important;
      text-align: right !important;
    }

    .ai-transformation-plan-card-original-price-{{ ai_gen_id }},
    .ai-transformation-plan-card-price-{{ ai_gen_id }},
    .ai-transformation-plan-card-monthly-{{ ai_gen_id }} {
      text-align: right !important;
    }

    .ai-transformation-plan-card-price-{{ ai_gen_id }} {
      font-size: 24px !important;
    }

    .ai-transformation-plan-card-footer-{{ ai_gen_id }} {
      -webkit-line-clamp: unset !important;
      display: block !important;
      overflow: visible !important;
    }
  }
/* /lurvox-mobile-plan-cards-v2 */`

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  if (!res.ok) throw new Error(`themes.json ${res.status}`)
  return (await res.json()).themes
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT ${key} -> ${res.status} ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

function replaceMobileCss(content) {
  // Remove v1 if present, then upsert v2
  const v1Start = '/* lurvox-mobile-plan-cards-v1 */'
  const v1End = '/* /lurvox-mobile-plan-cards-v1 */'
  if (content.includes(v1Start) && content.includes(v1End)) {
    const re = new RegExp(
      v1Start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        v1End.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    content = content.replace(re, '')
  }

  const v2Start = '/* lurvox-mobile-plan-cards-v2 */'
  const v2End = '/* /lurvox-mobile-plan-cards-v2 */'
  if (content.includes(v2Start) && content.includes(v2End)) {
    const re = new RegExp(
      v2Start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        v2End.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return content.replace(re, MOBILE_CSS)
  }

  if (!content.includes('{% endstyle %}')) {
    throw new Error('No {% endstyle %} in plan block')
  }
  return content.replace('{% endstyle %}', `${MOBILE_CSS}\n{% endstyle %}`)
}

function replaceRupeeInLiquid(content) {
  let next = content
  next = next.replace(
    /(<div class="ai-transformation-plan-card-original-price-\{\{ ai_gen_id \}\}">)₹(\{\{ plan_original_price \}\})/g,
    '$1Rs $2'
  )
  next = next.replace(
    /(<div class="ai-transformation-plan-card-price-\{\{ ai_gen_id \}\}">)₹(\{\{ plan_price \}\})/g,
    '$1Rs $2'
  )
  next = next.replace(
    /({{ block.settings.cta_text }} — )₹(<span data-cta-price>)/g,
    '$1Rs $2'
  )
  // Schema / info defaults and examples
  next = next.replaceAll('₹', 'Rs ')
  // Clean accidental double spaces from "Rs  " if any
  next = next.replace(/Rs {2,}/g, 'Rs ')
  return next
}

function patchIndexSettings(indexJson) {
  // Replace ₹ with Rs in plan monthly/savings strings (and any other plan strings)
  // Index may contain \/ escapes inside JSON strings.
  let next = indexJson.replace(/₹/g, 'Rs ')
  next = next.replace(/Rs {2,}/g, 'Rs ')
  return next
}

async function main() {
  const themes = await listThemes()
  const live = themes.find((t) => t.role === 'main')
  if (!live) throw new Error('No main theme')

  let block = await getAsset(live.id, BLOCK_KEY)
  const beforeRupee = (block.match(/₹/g) || []).length
  block = replaceMobileCss(block)
  block = replaceRupeeInLiquid(block)
  if (!block.includes('lurvox-mobile-plan-cards-v2')) {
    throw new Error('Mobile CSS v2 missing after patch')
  }
  if (!block.includes('Rs {{ plan_price }}') && !block.includes('Rs {{ plan_price }}')) {
    // Check either spacing form
  }
  if (!/Rs\s*\{\{\s*plan_price\s*\}\}/.test(block)) {
    throw new Error('Price markup not converted to Rs')
  }
  if (block.includes('₹')) {
    throw new Error('Rupee sign still present in block liquid')
  }

  let index = await getAsset(live.id, INDEX_KEY)
  const beforeIndexRupee = (index.match(/₹/g) || []).length
  index = patchIndexSettings(index)
  if (index.includes('₹')) {
    throw new Error('Rupee sign still present in index.json')
  }

  await putAsset(live.id, BLOCK_KEY, block)
  await putAsset(live.id, INDEX_KEY, index)

  fs.writeFileSync(path.join('scripts', 'tmp-live-plan-block-361650c.liquid'), block)
  fs.writeFileSync(path.join('scripts', 'tmp-live-index.json'), index)

  console.log(
    JSON.stringify(
      {
        themeId: live.id,
        name: live.name,
        blockBytes: block.length,
        indexBytes: index.length,
        removedRupeeFromBlock: beforeRupee,
        removedRupeeFromIndex: beforeIndexRupee,
        hasV2: block.includes('lurvox-mobile-plan-cards-v2'),
        samplePrice: block.match(/Rs \{\{ plan_price \}\}/)?.[0],
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
