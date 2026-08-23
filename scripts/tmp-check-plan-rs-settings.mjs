import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const live = themes.themes.find((t) => t.role === 'main')
const index = (
  await (
    await fetch(
      `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}&t=${Date.now()}`,
      { headers }
    )
  ).json()
).asset.value

const re = /"(plan_\d+_(?:monthly|savings))"\s*:\s*"((?:\\.|[^"\\])*)"/g
const matches = []
let m
while ((m = re.exec(index))) {
  matches.push({ key: m[1], value: JSON.parse(`"${m[2]}"`) })
}

console.log(
  JSON.stringify(
    {
      themeId: live.id,
      rupeeCount: (index.match(/₹/g) || []).length,
      rsCount: (index.match(/Rs /g) || []).length,
      matches,
    },
    null,
    2
  )
)
