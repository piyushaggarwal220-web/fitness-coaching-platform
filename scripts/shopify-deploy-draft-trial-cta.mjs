/**
 * Draft-only: add 7-day trial card CTA → app.lurvox.in/trial
 * Theme: Copy of Copy of LURVOX Price Review… (161294057723)
 * Does NOT publish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161294057723)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
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

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key)
}

async function getAsset(key) {
  const data = await api(
    'GET',
    `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`
  )
  return data.asset?.value ?? null
}

function readLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function insertTrialSection(indexJson) {
  const data = JSON.parse(indexJson)
  const sectionId = 'lurvox_trial_card'
  data.sections = data.sections || {}
  data.sections[sectionId] = {
    type: 'lurvox-trial-card',
    settings: {
      eyebrow: 'Try before you commit',
      title: '7-Day All-Access Trial',
      price: '₹179',
      meta: 'Once per person · all features unlocked',
      bullet_1: 'Full coaching features unlocked for 7 days',
      bullet_2: 'Coach chat, personal plan, trackers & check-ins',
      bullet_3: 'One trial per person — then upgrade to 3 / 6 / 12 months',
      cta_label: 'Start 7-day trial',
      cta_url: TRIAL_URL,
      accent_color: '#FF6200',
    },
  }

  const order = Array.isArray(data.order) ? [...data.order] : Object.keys(data.sections)
  const without = order.filter((id) => id !== sectionId)

  // Place near plan compare / pricing if present; else after first few sections.
  const compareIdx = without.findIndex(
    (id) =>
      id.includes('plan_compare') ||
      id.includes('plan-compare') ||
      id.includes('lurvox_plan') ||
      (data.sections[id]?.type || '').includes('plan-compare')
  )
  if (compareIdx >= 0) {
    without.splice(compareIdx + 1, 0, sectionId)
  } else {
    without.splice(Math.min(4, without.length), 0, sectionId)
  }
  data.order = without
  return JSON.stringify(data, null, 2)
}

function patchTalkPlanPicker(liquid) {
  if (liquid.includes('7-Day All-Access Trial') || liquid.includes('lx-trial-plan')) {
    return liquid
  }
  // Add a fourth selectable interest after plan 3 card (consult page).
  const marker = `<label class="lx-consult__plan">
            <input type="radio" name="lx-plan-{{ section.id }}" value="{{ p3_name }} — {{ p3_price }}" form="lx-consult-form-{{ section.id }}">`
  const idx = liquid.indexOf(marker)
  if (idx < 0) {
    console.warn('consult plan picker marker not found — skipping talk page plan option')
    return liquid
  }
  // Find end of that label block roughly by next closing of plan-list or after third card
  const insertAfter = liquid.indexOf('</label>', liquid.indexOf('</label>', liquid.indexOf('</label>', idx) + 1) + 1)
  if (insertAfter < 0) return liquid
  const end = insertAfter + '</label>'.length
  const snippet = `
          <label class="lx-consult__plan lx-trial-plan">
            <input type="radio" name="lx-plan-{{ section.id }}" value="7-Day All-Access Trial — ₹179" form="lx-consult-form-{{ section.id }}">
            <span class="lx-consult__plan-card">
              <span class="lx-consult__badge">Trial</span>
              <span class="lx-consult__plan-name">7-Day Trial</span>
              <span class="lx-consult__plan-price">₹179</span>
              <span class="lx-consult__plan-meta">All access · once per person</span>
            </span>
          </label>`
  return liquid.slice(0, end) + snippet + liquid.slice(end)
}

async function main() {
  console.log('Deploying trial CTA to draft theme', THEME_ID)

  const sectionLiquid = readLocal('scripts/shopify-assets/sections-lurvox-trial-card.liquid')
  await putAsset('sections/lurvox-trial-card.liquid', sectionLiquid)

  // Prefer GraphQL upsert for large templates when REST is flaky
  const indexKey = 'templates/index.json'
  const indexVal = await getAsset(indexKey)
  if (!indexVal) throw new Error('missing templates/index.json')
  const patchedIndex = insertTrialSection(indexVal)
  await putAsset(indexKey, patchedIndex)

  const talkSection = 'sections/lurvox-talk-to-coach.liquid'
  const talkVal = await getAsset(talkSection)
  if (talkVal) {
    const patchedTalk = patchTalkPlanPicker(talkVal)
    if (patchedTalk !== talkVal) {
      await putAsset(talkSection, patchedTalk)
    } else {
      console.log('talk section unchanged')
    }
  } else {
    console.warn('talk section missing on draft — skip plan picker option')
  }

  // Also try plan-compare template / section settings if present
  for (const key of [
    'sections/lurvox-plan-compare.liquid',
    'templates/page.plans.json',
    'templates/page.coaching-plans.json',
  ]) {
    const raw = await getAsset(key).catch(() => null)
    if (!raw) continue
    if (raw.includes(TRIAL_URL) || raw.includes('1_week_trial')) {
      console.log('already mentions trial:', key)
      continue
    }
  }

  const theme = await gql(`{
    theme(id: "gid://shopify/OnlineStoreTheme/${THEME_ID}") {
      id
      name
      role
    }
  }`)
  console.log('done', theme.theme)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
