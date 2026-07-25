/**
 * Apply mobile homepage fixes to an unpublished theme copy (or create one).
 * Uses REST assets API (more reliable right after themeDuplicate).
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

const FILES = [
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'layout/theme.liquid',
]

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

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
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GET ${key} -> ${res.status} ${text.slice(0, 200)}`)
  }
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

async function waitForAsset(themeId, key, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await getAsset(themeId, key)
      if (value && value.length > 100) return value
    } catch {
      // theme still copying
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${key} on theme ${themeId}`)
}

function replaceOrInsertBeforeEndstyle(content, marker, block) {
  const start = `/* ${marker} */`
  const end = `/* /${marker} */`
  const full = `${start}\n${block}\n${end}`
  if (content.includes(start) && content.includes(end)) {
    const re = new RegExp(
      start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return content.replace(re, full)
  }
  if (!content.includes('{% endstyle %}')) {
    throw new Error(`No {% endstyle %} for marker ${marker}`)
  }
  return content.replace('{% endstyle %}', `${full}\n{% endstyle %}`)
}

function patchClientResults(content) {
  return replaceOrInsertBeforeEndstyle(
    content,
    'lurvox-mobile-client-results-v1',
    `  .ai-client-results-{{ ai_gen_id }} {
    padding-top: 28px;
    scroll-margin-top: 120px;
  }

  .ai-client-results-header-{{ ai_gen_id }} {
    margin-top: 4px;
  }

  /* Only the centered/active card should show prev/next — stops neighbor arrows peeking */
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
  )
}

function patchGallery(content) {
  return replaceOrInsertBeforeEndstyle(
    content,
    'lurvox-mobile-fitness-gallery-v1',
    `  .ai-fitness-gallery__container-{{ ai_gen_id }} {
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
  )
}

function patchPlans(content) {
  return replaceOrInsertBeforeEndstyle(
    content,
    'lurvox-mobile-plan-cards-v1',
    `  @media screen and (max-width: 749px) {
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
  )
}

function patchTalk(layout) {
  const marker = 'lurvox-mobile-talk-cta-v1'
  const start = `/* ${marker} */`
  const end = `/* /${marker} */`
  const block = `${start}
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
${end}`

  if (layout.includes(start) && layout.includes(end)) {
    const re = new RegExp(
      start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return layout.replace(re, block)
  }

  const needle = `a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        font-size: 12px;
      }
    }`
  if (layout.includes(needle)) {
    return layout.replace(needle, `${needle}\n\n${block}`)
  }

  // Fallback: inject before talk CTA label script
  const scriptMarker = `<script>
    (function () {
      var label = function () {
        var links = document.querySelectorAll('a[href*="talk-to-a-coach"].header-actions__action');`
  if (layout.includes(scriptMarker)) {
    return layout.replace(scriptMarker, `</style>\n  ${block}\n  <style></style>\n  ${scriptMarker}`)
  }

  // Last resort: append before </body>
  if (layout.includes('</body>')) {
    return layout.replace('</body>', `<style>\n${block}\n</style>\n</body>`)
  }
  throw new Error('Could not patch talk CTA styles')
}

async function main() {
  const themes = await listThemes()
  const live = themes.find((t) => t.role === 'main')
  if (!live) throw new Error('No main theme')

  // Reuse unfinished copy from prior run if present
  let copy =
    themes.find((t) => t.name?.startsWith('LURVOX Mobile Home Fix') && t.role !== 'main') || null

  if (!copy) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const dup = await gql(
      `mutation themeDuplicate($id: ID!, $name: String!) {
        themeDuplicate(id: $id, name: $name) {
          newTheme { id name role }
          userErrors { field message }
        }
      }`,
      {
        id: `gid://shopify/OnlineStoreTheme/${live.id}`,
        name: `LURVOX Mobile Home Fix ${stamp}`,
      }
    )
    if (dup.themeDuplicate.userErrors?.length) {
      throw new Error(JSON.stringify(dup.themeDuplicate.userErrors))
    }
    const gid = dup.themeDuplicate.newTheme.id
    copy = {
      id: Number(String(gid).split('/').pop()),
      name: dup.themeDuplicate.newTheme.name,
    }
  }

  console.log('Using copy theme', copy.id, copy.name)

  // Wait until assets are readable
  await waitForAsset(copy.id, FILES[0])

  const results = {}
  for (const key of FILES) {
    let value = await getAsset(copy.id, key)
    const before = value.length
    if (key.includes('cd3c949')) value = patchClientResults(value)
    else if (key.includes('52353f6')) value = patchGallery(value)
    else if (key.includes('361650c')) value = patchPlans(value)
    else if (key === 'layout/theme.liquid') value = patchTalk(value)

    if (value.length === before && !value.includes('lurvox-mobile-')) {
      throw new Error(`Patch produced no change for ${key}`)
    }
    await putAsset(copy.id, key, value)
    results[key] = {
      bytes: value.length,
      hasMarker: /lurvox-mobile-/.test(value),
    }
  }

  console.log(
    JSON.stringify(
      {
        themeId: copy.id,
        name: copy.name,
        preview: `https://www.lurvox.in/?preview_theme_id=${copy.id}`,
        results,
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
