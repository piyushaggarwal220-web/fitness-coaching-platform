/**
 * Deploy storefront review changes onto:
 * "Copy of LURVOX Price Review 1499-2499-3999 2026..."
 * Theme id: 161251328251
 *
 * Does NOT publish. Preview via Admin themes → Preview.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161251328251)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('I want a free consultation call with the coach')

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath}: ${res.status} ${text.slice(0, 400)}`)
  }
  return json
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, {
    asset: { key, value },
  })
  console.log('uploaded', key)
}

async function getAsset(key) {
  const data = await api('GET', `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`)
  return data.asset?.value ?? null
}

function readLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function patchIndexJson(raw) {
  const json = JSON.parse(raw)
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const s = node.settings
    if (s && typeof s === 'object') {
      if (typeof s.plan_4_desc === 'string') {
        s.plan_4_desc =
          'Full coaching for 12 months. Lowest monthly cost, weekly front coach calls, priority check-ins, and maximum consistency support.'
      }
      if (typeof s.plan_4_description === 'string') {
        s.plan_4_description =
          '12-month exclusive: weekly front coach calls, priority check-ins, and our most complete transformation experience.'
      }
      if ('show_urgency' in s) s.show_urgency = true
      if ('countdown_hours' in s) s.countdown_hours = 8
      if ('urgency_label' in s) s.urgency_label = 'PRICE INCREASES IN'
      if ('consultation_url' in s || 'payment_help_url' in s) {
        s.consultation_url = WA
        s.consultation_label = 'Book a free consultation call with a coach'
      }
    }
    if (node.blocks && typeof node.blocks === 'object' && !Array.isArray(node.blocks)) {
      const blocks = Object.values(node.blocks)
      const hasWeeklyFront = blocks.some(
        (b) => b?.settings?.feature === 'Weekly front coach call'
      )
      if (!hasWeeklyFront) {
        const exclusiveHost = blocks.find(
          (b) => b?.type === 'row' && b?.settings?.feature === 'Priority check-ins'
        )
        if (exclusiveHost) {
          const id = `weekly_front_${Date.now()}`
          node.blocks[id] = {
            type: 'row',
            settings: {
              feature: 'Weekly front coach call',
              plan_3: false,
              plan_6: false,
              plan_12: true,
            },
          }
          if (Array.isArray(node.block_order)) {
            const idx = node.block_order.indexOf(
              Object.keys(node.blocks).find(
                (k) => node.blocks[k] === exclusiveHost
              )
            )
            if (idx >= 0) node.block_order.splice(idx + 1, 0, id)
            else node.block_order.push(id)
          }
        }
      }
    }
    Object.values(node).forEach(walk)
  }
  walk(json)
  return JSON.stringify(json)
}

function patchFooterGroup(raw) {
  let out = raw
  try {
    const json = JSON.parse(raw)
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      if (node.settings && typeof node.settings === 'object') {
        if ('consultation_url' in node.settings || 'payment_help_url' in node.settings) {
          node.settings.consultation_url = WA
          node.settings.consultation_label =
            'Book a free consultation call with a coach'
          delete node.settings.payment_help_url
        }
      }
      Object.values(node).forEach(walk)
    }
    walk(json)
    out = JSON.stringify(json)
  } catch {
    out = raw
  }
  return out
}

async function main() {
  const theme = await api('GET', `/themes/${THEME_ID}.json`)
  console.log('Target theme:', theme.theme?.id, theme.theme?.name, theme.theme?.role)

  const uploads = [
    ['sections/mobile-floating-bar.liquid', 'scripts/mobile-floating-bar.liquid'],
    [
      'snippets/lurvox-plan-compare-inline.liquid',
      'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid',
    ],
    [
      'sections/lurvox-plan-compare.liquid',
      'scripts/shopify-assets/sections-lurvox-plan-compare.liquid',
    ],
    [
      'sections/lurvox-home-redesign.liquid',
      'scripts/shopify-assets/sections-lurvox-home-redesign.liquid',
    ],
    [
      'blocks/ai_gen_block_361650c.liquid',
      'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid',
    ],
  ]

  for (const [key, rel] of uploads) {
    try {
      await putAsset(key, readLocal(rel))
    } catch (err) {
      console.warn('skip/fail', key, err.message)
    }
  }

  for (const key of ['templates/index.json', 'templates/index.home-redesign.json']) {
    try {
      const raw = await getAsset(key)
      if (!raw) continue
      await putAsset(key, patchIndexJson(raw))
    } catch (err) {
      console.warn('index patch skip', key, err.message)
    }
  }

  for (const key of ['sections/footer-group.json', 'sections/header-group.json']) {
    try {
      const raw = await getAsset(key)
      if (!raw) continue
      await putAsset(key, patchFooterGroup(raw))
    } catch (err) {
      console.warn('group patch skip', key, err.message)
    }
  }

  const preview = `https://${SHOP}/?preview_theme_id=${THEME_ID}`
  console.log('\nDONE — draft only, not published')
  console.log('Preview:', preview)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
