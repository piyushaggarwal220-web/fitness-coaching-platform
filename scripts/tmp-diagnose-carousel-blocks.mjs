/**
 * Diagnose why the three homepage carousel custom elements never register.
 * Fetches live theme block sources, extracts inline <script>, and syntax-checks them.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const KEYS = [
  { key: 'blocks/ai_gen_block_52353f6.liquid', role: 'fitness-gallery' },
  { key: 'blocks/ai_gen_block_cd3c949.liquid', role: 'client-results' },
  { key: 'blocks/ai_gen_block_a7d1b3c.liquid', role: 'member-wins' },
]

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  const json = await res.json()
  return json.themes.map((t) => ({ id: t.id, name: t.name, role: t.role }))
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) return { error: `${res.status} ${await res.text()}` }
  const json = await res.json()
  return { value: json.asset?.value ?? '' }
}

function extractScripts(src) {
  const out = []
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

function syntaxCheck(js) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(js)
    return { ok: true }
  } catch (err) {
    const message = String(err && err.message)
    return { ok: false, message }
  }
}

function braceBalance(js) {
  let curly = 0
  let paren = 0
  for (const ch of js) {
    if (ch === '{') curly += 1
    else if (ch === '}') curly -= 1
    else if (ch === '(') paren += 1
    else if (ch === ')') paren -= 1
  }
  return { curly, paren }
}

function analyze(label, src) {
  const scripts = extractScripts(src)
  return {
    label,
    bytes: src.length,
    scriptCount: scripts.length,
    hasDefine: src.includes('customElements.define'),
    defineCount: (src.match(/customElements\.define/g) || []).length,
    hasSetupAutoplay: src.includes('setupAutoplay'),
    hasStopAutoplay: src.includes('stopAutoplay'),
    hasScrollIntoView: src.includes('scrollIntoView'),
    scripts: scripts.map((js, i) => ({
      index: i,
      bytes: js.length,
      balance: braceBalance(js),
      syntax: syntaxCheck(js),
      hasDefine: js.includes('customElements.define'),
      tail: js.trim().slice(-220),
    })),
  }
}

const themes = await listThemes()
const live = themes.find((t) => t.role === 'main')

const report = { themes, live, blocks: [] }

for (const { key, role } of KEYS) {
  const asset = await getAsset(live.id, key)
  if (asset.error) {
    report.blocks.push({ key, role, error: asset.error })
    continue
  }
  const safeName = key.replace(/[/.]/g, '-')
  fs.writeFileSync(path.join(outDir, `tmp-diag-live-${safeName}`), asset.value, 'utf8')

  const entry = { key, role, live: analyze('live', asset.value) }

  const localCandidates = [
    `tmp-blocks-${path.basename(key)}`,
    `tmp-live-${path.basename(key)}`,
    `tmp-fixed-${path.basename(key)}`,
    `tmp-patched-blocks-${path.basename(key)}`,
    `tmp-autoplay-${path.basename(key)}`,
  ]
  entry.localCopies = []
  for (const name of localCandidates) {
    const p = path.join(outDir, name)
    if (fs.existsSync(p)) {
      entry.localCopies.push(analyze(name, fs.readFileSync(p, 'utf8')))
    }
  }
  report.blocks.push(entry)
}

fs.writeFileSync(
  path.join(outDir, 'tmp-diag-carousel-report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
)
console.log(JSON.stringify(report, null, 2))
