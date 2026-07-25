/**
 * Repair assets/floating-panel.js.
 *
 * An earlier league "back link" deploy appended a raw <script>…</script> HTML
 * snippet to this file. It is an ES module, so the stray HTML made the whole
 * file fail to parse ("Uncaught SyntaxError: Unexpected token '<'"), which meant
 * <floating-panel-component> was never registered anywhere on the storefront.
 *
 * The snippet is redundant: sections/lurvox-league.liquid already renders
 * `.lx-league__back` server-side. So the fix is to drop the appended HTML.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const KEY = 'assets/floating-panel.js'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

const original = await getAsset(KEY)
fs.writeFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-prefix-floating-panel.js.txt',
  original,
  'utf8'
)

const scriptIndex = original.indexOf('<script>')
if (scriptIndex < 0) {
  console.log(JSON.stringify({ alreadyClean: true, bytes: original.length }, null, 2))
  process.exit(0)
}

const cleaned = `${original.slice(0, scriptIndex).replace(/\s*$/, '')}\n`

// Parse-check the module before it goes anywhere near the live theme.
const tmpFile = path.join(os.tmpdir(), `floating-panel-check-${Date.now()}.mjs`)
fs.writeFileSync(tmpFile, cleaned, 'utf8')
let parseOk = true
let parseError = null
try {
  execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' })
} catch (err) {
  parseOk = false
  parseError = String(err.stderr || err.message).slice(0, 400)
}
fs.unlinkSync(tmpFile)

if (!parseOk) {
  console.error(JSON.stringify({ aborted: 'cleaned module failed parse check', parseError }, null, 2))
  process.exit(1)
}

const putRes = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: cleaned } }),
})
const putBody = await putRes.text()

await new Promise((r) => setTimeout(r, 3000))
const after = await getAsset(KEY)

console.log(
  JSON.stringify(
    {
      bytesBefore: original.length,
      bytesAfter: after.length,
      removedBytes: original.length - cleaned.length,
      parseOk,
      put: { ok: putRes.ok, status: putRes.status },
      putError: putRes.ok ? undefined : putBody.slice(0, 300),
      afterHasHtmlTag: after.includes('<script>'),
      afterEndsWithDefine: after.trimEnd().endsWith('}'),
      afterDefinesComponent: after.includes("customElements.define('floating-panel-component'"),
    },
    null,
    2
  )
)
