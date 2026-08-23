import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}
const draftId = 161176977659
const value = fs.readFileSync(
  path.join('scripts', 'shopify-assets', 'sections-header-group.header-redesign.json'),
  'utf8'
)
JSON.parse(value)

const put = await fetch(`${REST}/themes/${draftId}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'sections/header-group.json', value } }),
})
const putText = await put.text()
console.log('PUT', put.status, putText.slice(0, 500))

const get = await fetch(
  `${REST}/themes/${draftId}/assets.json?asset[key]=${encodeURIComponent('sections/header-group.json')}&t=${Date.now()}`,
  { headers }
)
const got = (await get.json()).asset?.value || ''
console.log(
  JSON.stringify(
    {
      getStatus: get.status,
      len: got.length,
      hasNew: /lurvox-header-redesign|lx_header_redesign/.test(got),
      hasOld: /header_section|lurvox_client_login/.test(got),
      head: got.slice(0, 220).replace(/\s+/g, ' '),
    },
    null,
    2
  )
)
if (!/lurvox-header-redesign/.test(got)) process.exit(1)
