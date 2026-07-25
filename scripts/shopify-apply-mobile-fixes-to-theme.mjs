/**
 * Apply the mobile homepage fixes to ANY theme id (idempotent).
 *
 * Usage: node scripts/shopify-apply-mobile-fixes-to-theme.mjs <themeId>
 *
 * Needed because the storefront can lag behind the admin "main" theme role,
 * so the fixes must exist on whichever theme is actually rendering.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themeId = process.argv[2]
if (!themeId) {
  console.error('Usage: node scripts/shopify-apply-mobile-fixes-to-theme.mjs <themeId>')
  process.exit(1)
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`PUT ${key} -> ${res.status} ${(await res.text()).slice(0, 300)}`)
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function upsertStyleBlock(content, marker, css) {
  const start = `/* ${marker} */`
  const end = `/* /${marker} */`
  const full = `${start}\n${css}\n${end}`
  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`), full)
  }
  if (!content.includes('{% endstyle %}')) {
    throw new Error(`no {% endstyle %} to anchor ${marker}`)
  }
  return content.replace('{% endstyle %}', `${full}\n{% endstyle %}`)
}

const CLIENT_RESULTS_CSS = `  .ai-client-results-{{ ai_gen_id }} {
    padding-top: 28px;
    scroll-margin-top: 120px;
  }

  .ai-client-results-header-{{ ai_gen_id }} {
    margin-top: 4px;
  }

  /* Only the centered/active card shows prev/next so neighbour arrows cannot peek */
  .ai-client-results-nav-{{ ai_gen_id }} {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .ai-client-results-card-{{ ai_gen_id }}.active .ai-client-results-nav-{{ ai_gen_id }} {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
  }

  @media screen and (max-width: 749px) {
    .ai-client-results-gallery-{{ ai_gen_id }} {
      padding: 0 5vw;
      gap: 12px;
    }

    .ai-client-results-card-{{ ai_gen_id }} {
      flex: 0 0 90vw;
      padding: 14px;
    }

    .ai-client-results-nav-left-{{ ai_gen_id }} {
      left: 4px;
    }

    .ai-client-results-nav-right-{{ ai_gen_id }} {
      right: 4px;
    }
  }`

const GALLERY_CSS = `  .ai-fitness-gallery__container-{{ ai_gen_id }} {
    overflow: hidden;
  }

  @media screen and (max-width: 749px) {
    .ai-fitness-gallery__container-{{ ai_gen_id }} {
      border-radius: 16px;
      padding: 10px;
      margin: 0 12px 16px;
    }

    .ai-fitness-gallery__track-{{ ai_gen_id }} {
      padding: 0;
      gap: 10px;
    }

    .ai-fitness-gallery__slide-{{ ai_gen_id }} {
      width: 100%;
    }

    .ai-fitness-gallery__image-{{ ai_gen_id }} {
      border-radius: 14px;
      max-height: 62vh;
    }

    .ai-fitness-gallery__thumbs-{{ ai_gen_id }} {
      max-width: calc(100% - 88px);
      gap: 6px;
    }

    .ai-fitness-gallery__thumb-{{ ai_gen_id }} {
      width: 44px;
      height: 44px;
    }
  }`

const PLAN_CSS = `  @media screen and (max-width: 749px) {
    .ai-transformation-plan-card-inner-{{ ai_gen_id }} {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
      align-items: start !important;
    }

    .ai-transformation-plan-card-right-{{ ai_gen_id }} {
      width: 100% !important;
      max-width: none !important;
      align-items: flex-start !important;
      text-align: left !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      gap: 8px 12px !important;
    }

    .ai-transformation-plan-card-footer-{{ ai_gen_id }} {
      -webkit-line-clamp: unset !important;
      display: block !important;
      overflow: visible !important;
    }
  }`

const TALK_BLOCK = `/* lurvox-mobile-talk-cta-v1 */
    @media screen and (max-width: 749px) {
      a.header-actions__action[href*="talk-to-a-coach"] {
        padding: 8px;
        gap: 0;
        min-width: 40px;
        min-height: 40px;
        justify-content: center;
      }

      a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        display: none !important;
      }
    }
    /* /lurvox-mobile-talk-cta-v1 */`

function patchTalk(layout) {
  const start = '/* lurvox-mobile-talk-cta-v1 */'
  const end = '/* /lurvox-mobile-talk-cta-v1 */'
  if (layout.includes(start) && layout.includes(end)) {
    return layout.replace(new RegExp(`${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`), TALK_BLOCK)
  }
  const anchor = `a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        font-size: 12px;
      }
    }`
  if (layout.includes(anchor)) {
    return layout.replace(anchor, `${anchor}\n\n    ${TALK_BLOCK}`)
  }
  // Fall back: close the talk CTA <style> with our rules appended
  const styleClose = layout.lastIndexOf('</style>')
  if (styleClose > -1) {
    return layout.slice(0, styleClose) + `\n    ${TALK_BLOCK}\n  ` + layout.slice(styleClose)
  }
  throw new Error('could not patch talk CTA styles in layout/theme.liquid')
}

const clientLoginSection = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/lurvox-client-login.liquid'),
  'utf8'
)

const plan = [
  {
    key: 'blocks/ai_gen_block_cd3c949.liquid',
    marker: 'lurvox-mobile-client-results-v1',
    apply: (v) => upsertStyleBlock(v, 'lurvox-mobile-client-results-v1', CLIENT_RESULTS_CSS),
  },
  {
    key: 'blocks/ai_gen_block_52353f6.liquid',
    marker: 'lurvox-mobile-fitness-gallery-v1',
    apply: (v) => upsertStyleBlock(v, 'lurvox-mobile-fitness-gallery-v1', GALLERY_CSS),
  },
  {
    key: 'blocks/ai_gen_block_361650c.liquid',
    marker: 'lurvox-mobile-plan-cards-v1',
    apply: (v) => upsertStyleBlock(v, 'lurvox-mobile-plan-cards-v1', PLAN_CSS),
  },
  {
    key: 'layout/theme.liquid',
    marker: 'lurvox-mobile-talk-cta-v1',
    apply: patchTalk,
  },
  {
    key: 'sections/lurvox-client-login.liquid',
    marker: 'text-overflow: ellipsis',
    apply: () => clientLoginSection,
  },
]

const results = {}
for (const step of plan) {
  const before = await getAsset(step.key)
  const after = step.apply(before)
  if (!after.includes(step.marker)) {
    throw new Error(`patch for ${step.key} did not produce marker ${step.marker}`)
  }
  if (after !== before) await putAsset(step.key, after)
  results[step.key] = { changed: after !== before, bytes: after.length }
}

console.log(JSON.stringify({ themeId, results }, null, 2))
