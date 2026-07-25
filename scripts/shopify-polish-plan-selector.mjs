/**
 * Professional mobile-first redesign of the homepage plan selector.
 * Deploys to live main theme: blocks/ai_gen_block_361650c.liquid
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
const MARKER = 'lurvox-plan-pro-v1'

const PRO_CSS = `/* ${MARKER} */
  /* —— Professional plan selector (mobile-first) —— */
  .ai-transformation-plan-{{ ai_gen_id }} {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  .ai-transformation-plan-header-{{ ai_gen_id }} {
    margin-bottom: 22px !important;
    text-align: left !important;
  }

  .ai-transformation-plan-label-{{ ai_gen_id }} {
    font-size: 10px !important;
    letter-spacing: 0.18em !important;
    margin-bottom: 8px !important;
    opacity: 0.95;
  }

  .ai-transformation-plan-headline-{{ ai_gen_id }} {
    font-size: 1.65rem !important;
    line-height: 1.15 !important;
    letter-spacing: -0.03em !important;
    margin-bottom: 8px !important;
    font-weight: 700 !important;
  }

  .ai-transformation-plan-subheadline-{{ ai_gen_id }} {
    font-size: 13px !important;
    line-height: 1.45 !important;
    max-width: 36rem !important;
    margin: 0 !important;
    opacity: 0.78;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ai-transformation-plan-cards-{{ ai_gen_id }} {
    gap: 10px !important;
    margin-bottom: 8px !important;
  }

  /* Kill heavy glow / dim states — clean equal cards */
  .ai-transformation-plan-card-{{ ai_gen_id }},
  .ai-transformation-plan-card-{{ ai_gen_id }}.selected {
    opacity: 1 !important;
    transform: none !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 100%) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: none !important;
    border-radius: 16px !important;
    padding: 14px 14px !important;
    transition: border-color 180ms ease, background 180ms ease, transform 180ms ease !important;
    -webkit-tap-highlight-color: transparent;
  }

  .ai-transformation-plan-card-{{ ai_gen_id }}:active {
    transform: scale(0.985) !important;
    border-color: rgba(255, 98, 0, 0.55) !important;
  }

  .ai-transformation-plan-card-{{ ai_gen_id }}:hover {
    opacity: 1 !important;
    transform: none !important;
    border-color: rgba(255, 98, 0, 0.4) !important;
    background: linear-gradient(180deg, rgba(255,98,0,0.08) 0%, rgba(255,255,255,0.03) 100%) !important;
  }

  .ai-transformation-plan-card-inner-{{ ai_gen_id }} {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 12px !important;
    align-items: center !important;
  }

  .ai-transformation-plan-card-left-{{ ai_gen_id }} {
    min-width: 0 !important;
    gap: 4px !important;
  }

  .ai-transformation-plan-card-header-{{ ai_gen_id }} {
    gap: 6px !important;
    margin-bottom: 2px !important;
  }

  .ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 10px !important;
    letter-spacing: 0.12em !important;
    font-weight: 650 !important;
    color: rgba(255, 255, 255, 0.55) !important;
  }

  .ai-transformation-plan-badge-{{ ai_gen_id }} {
    font-size: 9px !important;
    padding: 3px 8px !important;
    border-radius: 999px !important;
    letter-spacing: 0.06em !important;
    background: rgba(255, 98, 0, 0.16) !important;
    color: #ff8a3d !important;
    border: 1px solid rgba(255, 98, 0, 0.35) !important;
    font-weight: 700 !important;
  }

  .ai-transformation-plan-card-duration-{{ ai_gen_id }} {
    font-size: 1.15rem !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em !important;
    color: #f5f5f5 !important;
    text-transform: none !important;
  }

  /* Descriptions crowd the phone layout — keep them for desktop only */
  .ai-transformation-plan-card-description-{{ ai_gen_id }},
  .ai-transformation-plan-card-footer-{{ ai_gen_id }} {
    display: none !important;
  }

  .ai-transformation-plan-card-right-{{ ai_gen_id }} {
    align-items: flex-end !important;
    text-align: right !important;
    flex-direction: column !important;
    gap: 3px !important;
    flex-shrink: 0 !important;
  }

  .ai-transformation-plan-card-pricing-{{ ai_gen_id }} {
    align-items: flex-end !important;
    gap: 2px !important;
  }

  .ai-transformation-plan-card-original-price-{{ ai_gen_id }} {
    font-size: 11px !important;
    opacity: 0.45 !important;
    order: 0;
    white-space: nowrap !important;
  }

  .ai-transformation-plan-card-price-{{ ai_gen_id }} {
    font-size: 1.35rem !important;
    font-weight: 750 !important;
    letter-spacing: -0.03em !important;
    line-height: 1.05 !important;
    color: #ffffff !important;
    white-space: nowrap !important;
  }

  .ai-transformation-plan-card-monthly-{{ ai_gen_id }} {
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.55) !important;
    white-space: nowrap !important;
  }

  .ai-transformation-plan-card-savings-{{ ai_gen_id }} {
    margin-top: 4px !important;
    font-size: 9px !important;
    padding: 3px 7px !important;
    border-radius: 6px !important;
    letter-spacing: 0.04em !important;
    background: rgba(255, 98, 0, 0.95) !important;
    color: #0a0a0a !important;
    font-weight: 800 !important;
    white-space: nowrap !important;
  }

  .ai-transformation-plan-radio-{{ ai_gen_id }} {
    display: none !important;
  }

  .ai-transformation-plan-cta-wrapper-{{ ai_gen_id }} {
    display: none !important;
  }

  .ai-transformation-plan-urgency-{{ ai_gen_id }} {
    display: none !important;
  }

  @media screen and (min-width: 750px) {
    .ai-transformation-plan-{{ ai_gen_id }} {
      padding-left: 40px !important;
      padding-right: 40px !important;
    }

    .ai-transformation-plan-header-{{ ai_gen_id }} {
      text-align: center !important;
      margin-bottom: 36px !important;
    }

    .ai-transformation-plan-headline-{{ ai_gen_id }} {
      font-size: 2.75rem !important;
    }

    .ai-transformation-plan-subheadline-{{ ai_gen_id }} {
      margin: 0 auto !important;
      font-size: 15px !important;
      -webkit-line-clamp: unset;
      display: block;
      overflow: visible;
    }

    .ai-transformation-plan-cards-{{ ai_gen_id }} {
      gap: 14px !important;
      max-width: 760px;
      margin-left: auto;
      margin-right: auto;
    }

    .ai-transformation-plan-card-{{ ai_gen_id }},
    .ai-transformation-plan-card-{{ ai_gen_id }}.selected {
      padding: 22px 24px !important;
      border-radius: 18px !important;
    }

    .ai-transformation-plan-card-duration-{{ ai_gen_id }} {
      font-size: 1.35rem !important;
    }

    .ai-transformation-plan-card-description-{{ ai_gen_id }} {
      display: block !important;
      font-size: 13.5px !important;
      line-height: 1.45 !important;
      color: rgba(255, 255, 255, 0.58) !important;
      margin-top: 4px !important;
    }

    .ai-transformation-plan-card-footer-{{ ai_gen_id }} {
      display: block !important;
      font-style: normal !important;
      font-size: 12px !important;
      color: rgba(255, 255, 255, 0.4) !important;
      margin-top: 6px !important;
    }

    .ai-transformation-plan-card-price-{{ ai_gen_id }} {
      font-size: 1.75rem !important;
    }

    .ai-transformation-plan-card-monthly-{{ ai_gen_id }} {
      font-size: 12px !important;
    }

    .ai-transformation-plan-urgency-{{ ai_gen_id }} {
      display: block !important;
      margin-top: 8px !important;
      margin-bottom: 12px !important;
      opacity: 0.85;
    }

    .ai-transformation-plan-countdown-{{ ai_gen_id }} {
      font-size: 1.75rem !important;
      letter-spacing: 0.04em !important;
    }
  }
/* /${MARKER} */`

function upsertMarkedBlock(content, block) {
  const start = `/* ${MARKER} */`
  const end = `/* /${MARKER} */`
  if (content.includes(start) && content.includes(end)) {
    const re = new RegExp(
      start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return content.replace(re, block)
  }
  if (!content.includes('{% endstyle %}')) {
    throw new Error('No {% endstyle %} in plan block')
  }
  return content.replace('{% endstyle %}', `${block}\n{% endstyle %}`)
}

async function main() {
  const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
  const live = themes.themes.find((t) => t.role === 'main')
  if (!live) throw new Error('No main theme')

  const get = await fetch(
    `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
    { headers }
  )
  if (!get.ok) throw new Error(`GET ${get.status}`)
  let value = (await get.json()).asset.value

  value = upsertMarkedBlock(value, PRO_CSS)

  // Keep Rs formatting intact
  if (!value.includes('Rs&nbsp;{{ plan_price }}') && !value.includes('Rs {{ plan_price }}')) {
    value = value
      .replace(
        /(<div class="ai-transformation-plan-card-original-price-\{\{ ai_gen_id \}\}">)₹?(\{\{ plan_original_price \}\})/g,
        '$1Rs&nbsp;$2'
      )
      .replace(
        /(<div class="ai-transformation-plan-card-price-\{\{ ai_gen_id \}\}">)₹?(\{\{ plan_price \}\})/g,
        '$1Rs&nbsp;$2'
      )
  }

  const put = await fetch(`${REST}/themes/${live.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key: KEY, value } }),
  })
  if (!put.ok) throw new Error(`PUT ${put.status} ${(await put.text()).slice(0, 400)}`)

  const outDir = path.join('scripts', 'shopify-assets')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'blocks-ai_gen_block_361650c.liquid'), value)
  fs.writeFileSync(path.join('scripts', 'tmp-live-plan-block-361650c.liquid'), value)

  console.log(
    JSON.stringify(
      {
        themeId: live.id,
        name: live.name,
        bytes: value.length,
        hasPro: value.includes(MARKER),
        preview: `https://www.lurvox.in/?planpro=${Date.now()}`,
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
