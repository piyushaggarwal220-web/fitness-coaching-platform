/**
 * Live theme fixes:
 *  1. Homepage "CHOOSE YOUR PLAN" CTAs (middle + bottom) pointed at a dead
 *     anchor (/#shopify-section-blocks_C9E4qf). Point them at the 12-month plan page.
 *  2. Deploy the persistent 8-hour urgency countdown (localStorage-backed).
 *  3. Highlight the "Talk to a coach" CTAs (header icon action + mobile floating bar).
 *
 * Requires Shopify auth token at %TEMP%/shopify-auth-token.json
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const APP = 'https://app.lurvox.in'
const TWELVE_MONTH_URL = `${APP}/plans/12-months`
const tokenPath = path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token at', tokenPath)
  process.exit(1)
}
const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token

const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = await fetch(`${REST}/themes.json`, { headers }).then((r) => r.json())
const live = themes.themes.find((t) => t.role === 'main')
if (!live) throw new Error('No main theme found')
console.log('live theme:', live.id, live.name)

const getAsset = async (key) => {
  const json = await fetch(
    `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  return json.asset?.value ?? null
}

const putAsset = async (key, value) => {
  const res = await fetch(`${REST}/themes/${live.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json.errors || json)}`)
  console.log('upserted', key)
}

/* ------------------------------------------------------------------ */
/* 1. Homepage CTA links                                               */
/* ------------------------------------------------------------------ */
const rawIndex = await getAsset('templates/index.json')
const index = JSON.parse(rawIndex.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))

let ctaFixes = 0
for (const section of Object.values(index.sections ?? {})) {
  for (const block of Object.values(section.blocks ?? {})) {
    const s = block.settings
    if (!s) continue
    for (const key of Object.keys(s)) {
      if (!/link|url/i.test(key)) continue
      const value = s[key]
      if (typeof value !== 'string') continue
      const dead = value === '#' || /^\/?#shopify-section/.test(value)
      if (!dead) continue
      s[key] = TWELVE_MONTH_URL
      ctaFixes += 1
      console.log(`fixed ${block.type}.${key}: ${JSON.stringify(value)} -> ${TWELVE_MONTH_URL}`)
    }
    if (block.type === 'ai_gen_block_8d967d7') {
      s.button_text = 'GET THE 12-MONTH PLAN'
      if (!String(s.subheadline ?? '').includes('₹5,000')) {
        s.subheadline = `${s.subheadline} Best value — and the only plan that unlocks Crazy League prize money up to ₹5,000.`
      }
    }
  }
}
console.log('cta link fixes:', ctaFixes)

/* ------------------------------------------------------------------ */
/* 2. Plan selector block: persistent countdown + safe CTA href         */
/* ------------------------------------------------------------------ */
const planBlockKey = 'blocks/ai_gen_block_361650c.liquid'
const localPlanBlock = path.join(process.cwd(), 'scripts/tmp-cta-blocks-ai_gen_block_361650c.liquid')
let planLiquid = fs.existsSync(localPlanBlock)
  ? fs.readFileSync(localPlanBlock, 'utf8')
  : await getAsset(planBlockKey)
if (!planLiquid) throw new Error('plan selector liquid not found')

if (!planLiquid.includes('lurvox-urgency-countdown-end-v1')) {
  throw new Error('local plan selector liquid is missing the persistent countdown patch')
}

planLiquid = planLiquid.replace(
  '<a href="#" class="ai-transformation-plan-cta-{{ ai_gen_id }}" data-cta-button>',
  `<a href="{{ block.settings.plan_1_link | default: '${TWELVE_MONTH_URL}' }}" class="ai-transformation-plan-cta-{{ ai_gen_id }}" data-cta-button>`
)

/* ------------------------------------------------------------------ */
/* 3. Talk-to-a-coach highlight: floating bar                          */
/* ------------------------------------------------------------------ */
const fabKey = 'sections/mobile-floating-bar.liquid'
let fab = await getAsset(fabKey)
if (!fab) throw new Error('floating bar not found')

fab = fab.replace(
  '<span class="lurvox-fab__label">Book Consultation</span>',
  '<span class="lurvox-fab__label">Talk To A Coach</span>'
)

if (!fab.includes('/* lurvox-talk-pulse */')) {
  fab = fab.replace(
    '    #lurvox-fab-{{ section.id }} .lurvox-fab__btn:hover {',
    `    /* lurvox-talk-pulse */
    #lurvox-fab-{{ section.id }} .lurvox-fab__btn--primary {
      position: relative;
      animation: lurvox-talk-pulse-{{ section.id }} 2.6s ease-in-out infinite;
    }

    @keyframes lurvox-talk-pulse-{{ section.id }} {
      0%,
      100% {
        box-shadow: 0 10px 28px rgba(255, 98, 0, 0.28);
      }
      50% {
        box-shadow:
          0 10px 28px rgba(255, 98, 0, 0.45),
          0 0 0 4px rgba(255, 98, 0, 0.18);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #lurvox-fab-{{ section.id }} .lurvox-fab__btn--primary {
        animation: none;
      }
    }

    #lurvox-fab-{{ section.id }} .lurvox-fab__btn:hover {`
  )
}

/* ------------------------------------------------------------------ */
/* 4. Talk-to-a-coach highlight: header icon action gets a label pill   */
/* ------------------------------------------------------------------ */
const layoutKey = 'layout/theme.liquid'
let layout = await getAsset(layoutKey)
if (!layout) throw new Error('layout/theme.liquid not found')

const TALK_MARK = 'lurvox-talk-cta-highlight'
if (!layout.includes(TALK_MARK)) {
  const injection = `
  {%- comment -%} ${TALK_MARK} {%- endcomment -%}
  <style>
    a.header-actions__action[href*="talk-to-a-coach"] {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      color: #ffffff;
      background: linear-gradient(180deg, #ff7a1a 0%, #ff6200 100%);
      box-shadow: 0 8px 22px rgba(255, 98, 0, 0.32);
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1;
      text-decoration: none;
      animation: lurvox-talk-cta-pulse 2.6s ease-in-out infinite;
    }

    a.header-actions__action[href*="talk-to-a-coach"] .svg-wrapper,
    a.header-actions__action[href*="talk-to-a-coach"] svg {
      color: #ffffff;
    }

    a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
      font-size: 13px;
      white-space: nowrap;
    }

    @keyframes lurvox-talk-cta-pulse {
      0%,
      100% {
        box-shadow: 0 8px 22px rgba(255, 98, 0, 0.32);
      }
      50% {
        box-shadow:
          0 8px 22px rgba(255, 98, 0, 0.45),
          0 0 0 4px rgba(255, 98, 0, 0.16);
      }
    }

    @media screen and (max-width: 749px) {
      a.header-actions__action[href*="talk-to-a-coach"] {
        padding: 7px 11px;
      }

      a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        font-size: 12px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      a.header-actions__action[href*="talk-to-a-coach"] {
        animation: none;
      }
    }
  </style>
  <script>
    (function () {
      var label = function () {
        var links = document.querySelectorAll('a[href*="talk-to-a-coach"].header-actions__action');
        for (var i = 0; i < links.length; i += 1) {
          var link = links[i];
          if (link.querySelector('.lurvox-talk-cta__label')) continue;
          var span = document.createElement('span');
          span.className = 'lurvox-talk-cta__label';
          span.textContent = 'Talk to a coach';
          link.appendChild(span);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', label);
      } else {
        label();
      }
      document.addEventListener('shopify:section:load', label);
    })();
  </script>
`
  if (!layout.includes('</body>')) throw new Error('layout has no </body>')
  layout = layout.replace('</body>', `${injection}</body>`)
}

/* ------------------------------------------------------------------ */
await putAsset('templates/index.json', JSON.stringify(index, null, 2))
await putAsset(planBlockKey, planLiquid)
await putAsset(fabKey, fab)
await putAsset(layoutKey, layout)

fs.writeFileSync(localPlanBlock, planLiquid)
fs.writeFileSync(path.join(process.cwd(), 'scripts/mobile-floating-bar.liquid'), fab)

console.log('done')
