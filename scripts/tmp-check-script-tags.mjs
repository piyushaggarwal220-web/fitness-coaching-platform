import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const tags = await (await fetch(`${REST}/script_tags.json`, { headers })).json()
console.log('existing script tags', tags)

const html = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
console.log(
  'external scripts on home',
  scripts.filter((s) => !/cdn\/shop\/t\/|shopifycloud|shopify\.com\/s\/|myshopify/i.test(s))
)
console.log(
  'all script count',
  scripts.length,
  'has shopify-digital',
  html.includes('shopify-digital-wallet') || html.includes('script_tags')
)
