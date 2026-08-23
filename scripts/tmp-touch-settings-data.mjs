import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('MAIN', main.id, main.name)

const key = 'config/settings_data.json'
const get = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const asset = (await get.json()).asset
let raw = asset.value
// settings_data often starts with /*...*/ comment then JSON
const jsonStart = raw.indexOf('{')
const prefix = raw.slice(0, jsonStart)
const data = JSON.parse(raw.slice(jsonStart))
data.lurvox_cache_bust = Date.now()
// Shopify may strip unknown root keys — put under current similarly
data.current = data.current || {}
if (typeof data.current === 'object' && !Array.isArray(data.current)) {
  data.current.lurvox_cache_bust = String(Date.now())
}
const next = prefix + JSON.stringify(data)
const put = await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ asset: { key, value: next } }),
})
const putText = await put.text()
console.log('settings_data put', put.status, putText.slice(0, 300))

// Also verify current asset state of hide section on MAIN
const hide = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=sections/lurvox-hide-1month.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const hideVal = (await hide.json()).asset?.value || ''
console.log('hide section has showTrialPlan?', hideVal.includes('showTrialPlan'))
console.log('hide section preview:', hideVal.slice(0, 200).replace(/\s+/g, ' '))

const login = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=sections/lurvox-client-login.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const loginVal = (await login.json()).asset?.value || ''
console.log('login has stabilize?', loginVal.includes('lurvox-stabilize-trial'))

const hg = JSON.parse(
  (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=sections/header-group.json&t=${Date.now()}`,
        { headers: { 'X-Shopify-Access-Token': token } }
      )
    ).json()
  ).asset.value
)
console.log('header order', hg.order)
console.log('header has hide?', Boolean(hg.sections?.lurvox_hide_1month))
