/**
 * Site audit for lurvox.in: broken links, broken images, and the
 * floating-panel.js load error seen in the browser console.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const adminHeaders = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const PAGES = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/pages/league',
  'https://www.lurvox.in/pages/plans',
]

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

async function checkUrl(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', headers: UA, redirect: 'follow' })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', headers: UA, redirect: 'follow' })
    }
    return { url, status: res.status, finalUrl: res.url }
  } catch (err) {
    return { url, status: 'error', message: String(err && err.message).slice(0, 120) }
  }
}

const report = { pages: [], floatingPanel: null, brokenLinks: [], brokenAssets: [] }
const seen = new Map()

for (const page of PAGES) {
  const res = await fetch(`${page}?audit=${Date.now()}`, { headers: UA })
  const html = await res.text()

  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1])
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])

  const links = [...new Set(hrefs.map((h) => absolutize(h, page)).filter(Boolean))].filter(
    (u) => /^https?:/.test(u) && !u.startsWith('mailto') && !/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(u)
  )
  const assets = [...new Set([...imgs, ...scripts].map((h) => absolutize(h, page)).filter(Boolean))]

  report.pages.push({
    page,
    status: res.status,
    linkCount: links.length,
    assetCount: assets.length,
  })

  for (const url of [...links, ...assets]) {
    if (seen.has(url)) continue
    const result = await checkUrl(url)
    seen.set(url, result)
    const isAsset = assets.includes(url)
    const bad = result.status === 'error' || (typeof result.status === 'number' && result.status >= 400)
    if (bad) {
      const entry = { foundOn: page, ...result }
      if (isAsset) report.brokenAssets.push(entry)
      else report.brokenLinks.push(entry)
    }
  }
}

// floating-panel.js threw "Unexpected token '<'" in the browser console.
const cdnRes = await fetch(
  'https://www.lurvox.in/cdn/shop/t/10/assets/floating-panel.js?v=65014223657550707731784886951',
  { headers: UA }
)
const cdnBody = await cdnRes.text()
const cdnLines = cdnBody.split('\n')

const adminRes = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent('assets/floating-panel.js')}&t=${Date.now()}`,
  { headers: adminHeaders }
)
const adminJson = await adminRes.json()
const themeSource = adminJson.asset?.value ?? null
const themeLines = themeSource ? themeSource.split('\n') : []

report.floatingPanel = {
  cdnStatus: cdnRes.status,
  cdnContentType: cdnRes.headers.get('content-type'),
  cdnBytes: cdnBody.length,
  cdnLineCount: cdnLines.length,
  cdnLines78to84: cdnLines.slice(77, 84),
  themeAssetExists: Boolean(themeSource),
  themeBytes: themeSource ? themeSource.length : 0,
  themeLineCount: themeLines.length,
  themeLines78to84: themeLines.slice(77, 84),
}

fs.writeFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-audit-lurvox-report.json',
  JSON.stringify({ ...report, allChecked: [...seen.values()] }, null, 2),
  'utf8'
)

console.log(JSON.stringify(report, null, 2))
