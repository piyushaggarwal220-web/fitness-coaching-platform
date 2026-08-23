import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

function inspect(key, src) {
  const schemaMatch = src.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/)
  let schemaValid = null
  let schemaError = null
  if (schemaMatch) {
    try {
      JSON.parse(schemaMatch[1])
      schemaValid = true
    } catch (err) {
      schemaValid = false
      schemaError = String(err && err.message).slice(0, 200)
    }
  }
  return {
    key,
    bytes: src.length,
    schemaCount: (src.match(/\{%\s*schema\s*%\}/g) || []).length,
    endschemaCount: (src.match(/\{%\s*endschema\s*%\}/g) || []).length,
    schemaValid,
    schemaError,
    ifs: (src.match(/\{%-?\s*if\s/g) || []).length,
    endifs: (src.match(/\{%-?\s*endif/g) || []).length,
    fors: (src.match(/\{%-?\s*for\s/g) || []).length,
    endfors: (src.match(/\{%-?\s*endfor/g) || []).length,
    cases: (src.match(/\{%-?\s*case\s/g) || []).length,
    endcases: (src.match(/\{%-?\s*endcase/g) || []).length,
    styleTags: (src.match(/\{%\s*style(sheet)?\s*%\}/g) || []).length,
    endStyleTags: (src.match(/\{%\s*endstyle(sheet)?\s*%\}/g) || []).length,
    renders: [...new Set([...src.matchAll(/\{%-?\s*(?:render|include)\s+'([^']+)'/g)].map((m) => m[1]))],
    sectionsRendered: [...new Set([...src.matchAll(/\{%-?\s*section\s+'([^']+)'/g)].map((m) => m[1]))],
    head: src.slice(0, 200),
  }
}

const assetsRes = await fetch(`${REST}/themes/${THEME}/assets.json`, { headers })
const allAssets = (await assetsRes.json()).assets.map((a) => a.key)

const out = []
for (const key of [
  'sections/lurvox-consistency-league.liquid',
  'sections/lurvox-league.liquid',
  'sections/lurvox-page-content.liquid',
]) {
  const src = await getAsset(key)
  if (!src) {
    out.push({ key, missing: true })
    continue
  }
  fs.writeFileSync(path.join(outDir, `tmp-audit-${key.replace(/[/]/g, '-')}`), src, 'utf8')
  const info = inspect(key, src)
  info.missingSnippets = info.renders.filter((s) => !allAssets.includes(`snippets/${s}.liquid`))
  out.push(info)
}

console.log(JSON.stringify(out, null, 2))
