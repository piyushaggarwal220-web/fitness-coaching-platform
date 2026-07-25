/**
 * Live theme fixes:
 *  1. Homepage "CHOOSE YOUR PLAN" CTAs (middle + bottom) pointed at a dead
 *     anchor (/#shopify-section-blocks_C9E4qf). Point them at the 12-month plan page.
 *  2. Deploy the persistent 8-hour urgency countdown (localStorage-backed).
 *  3. Highlight "Talk to a coach" using typography + colour only.
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
let planLiquid = await getAsset(planBlockKey)
if (!planLiquid) throw new Error('plan selector liquid not found')

if (!planLiquid.includes('lurvox-urgency-countdown-end-v1')) {
  planLiquid = planLiquid.replace(
    `        const hours = parseInt(this.countdownElement.getAttribute('data-countdown-end')) || 8;
        const endTime = new Date().getTime() + (hours * 60 * 60 * 1000);`,
    `        const hours = parseInt(this.countdownElement.getAttribute('data-countdown-end')) || 8;
        const storageKey = 'lurvox-urgency-countdown-end-v1';
        const duration = hours * 60 * 60 * 1000;
        const rawStored = window.localStorage.getItem(storageKey);
        const stored = rawStored === null ? NaN : Number(rawStored);
        const endTime = Number.isFinite(stored) ? stored : Date.now() + duration;
        if (!Number.isFinite(stored)) {
          window.localStorage.setItem(storageKey, String(endTime));
        }`
  )
}
planLiquid = planLiquid
  .replace(
    'if (Number.isFinite(parsed) && parsed > Date.now()) {',
    'if (Number.isFinite(parsed)) {'
  )
  .replace(
    `          if (distance < 0) {
            endTime = now + durationMs;
            try {
              localStorage.setItem(storageKey, String(endTime));
            } catch (e) {}
            distance = endTime - now;
          }`,
    `          if (distance < 0) {
            this.countdownElement.textContent = '00:00:00';
            clearInterval(this.countdownInterval);
            return;
          }`
  )
if (!planLiquid.includes('lurvox-urgency-countdown-end-v1')) {
  throw new Error('Could not install persistent countdown patch')
}

planLiquid = planLiquid
  .replace(/\s*assign plan_default_key = 'plan_' \| append: i \| append: '_default'/, '')
  .replace(/\s*assign plan_default = block\.settings\[plan_default_key\]/, '')

planLiquid = planLiquid.replace(
  '<a href="#" class="ai-transformation-plan-cta-{{ ai_gen_id }}" data-cta-button>',
  `<a href="{{ block.settings.plan_1_link | default: '${TWELVE_MONTH_URL}' }}" class="ai-transformation-plan-cta-{{ ai_gen_id }}" data-cta-button>`
)

/* ------------------------------------------------------------------ */
/* 3. Talk-to-a-coach: typography + colour only                        */
/* ------------------------------------------------------------------ */
const fabKey = 'sections/mobile-floating-bar.liquid'
let fab = await getAsset(fabKey)
if (!fab) throw new Error('floating bar not found')

fab = fab.replace(
  '<span class="lurvox-fab__label">Book Consultation</span>',
  '<span class="lurvox-fab__label">Talk To A Coach</span>'
)

const fabTypography = `    /* lurvox-talk-typography-only */
    #lurvox-fab-{{ section.id }} .lurvox-fab__btn--primary {
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      color: #ff6200 !important;
      animation: none !important;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    #lurvox-fab-{{ section.id }} .lurvox-fab__btn--primary svg {
      color: #ff6200 !important;
    }
`
fab = fab.replace(
  /    \/\* lurvox-talk-(?:pulse|typography-only) \*\/[\s\S]*?(?=    #lurvox-fab-\{\{ section\.id \}\} \.lurvox-fab__btn:hover \{)/,
  fabTypography
)
if (!fab.includes('/* lurvox-talk-typography-only */')) {
  fab = fab.replace(
    '    #lurvox-fab-{{ section.id }} .lurvox-fab__btn:hover {',
    `${fabTypography}    #lurvox-fab-{{ section.id }} .lurvox-fab__btn:hover {`
  )
}

/* ------------------------------------------------------------------ */
/* 4. Header action label: typography + colour, no pill/pulse            */
/* ------------------------------------------------------------------ */
const layoutKey = 'layout/theme.liquid'
let layout = await getAsset(layoutKey)
if (!layout) throw new Error('layout/theme.liquid not found')

const TALK_MARK = 'lurvox-talk-cta-highlight'
const injection = `
  {%- comment -%} ${TALK_MARK} · typography-only {%- endcomment -%}
  <style>
    a.header-actions__action[href*="talk-to-a-coach"] {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0;
      border-radius: 0;
      color: #ff6200 !important;
      background: transparent !important;
      box-shadow: none !important;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1;
      text-decoration: none;
      animation: none !important;
    }

    a.header-actions__action[href*="talk-to-a-coach"] .svg-wrapper,
    a.header-actions__action[href*="talk-to-a-coach"] svg {
      color: #ff6200 !important;
    }

    a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
      font-size: 13px;
      white-space: nowrap;
    }

    @media screen and (max-width: 749px) {
      a.header-actions__action[href*="talk-to-a-coach"] {
        padding: 0;
      }

      a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        font-size: 12px;
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
layout = layout.replace(
  /\s*\{%- comment -%\} lurvox-talk-cta-highlight[\s\S]*?<\/script>\s*/,
  `\n${injection}\n`
)
if (!layout.includes(`${TALK_MARK} · typography-only`)) {
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
