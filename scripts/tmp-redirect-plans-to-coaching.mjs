/**
 * Point /pages/plans at fresh content:
 * - Ensure coaching-plans has the no-1-month body
 * - Remove/rename the cached plans page
 * - Add URL redirect /pages/plans -> /pages/coaching-plans
 */
import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const body = `<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h1>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month. Secure checkout opens on the LURVOX app.</p>
  <h2 style="margin:28px 0 10px;font-size:18px;">Everything included</h2>
  <ul style="margin:0 0 24px;padding-left:18px;color:#333;">
    <li>Personal workout plan (gym, home, or both)</li>
    <li>Personal diet plan (veg / non-veg / allergies supported)</li>
    <li>Weekly coach check-ins with a real human coach</li>
    <li>Direct coach chat inside the client app</li>
    <li>Daily trackers: workout, diet, water, sleep, steps, supplements + habits</li>
    <li>Progress photos, measurements, and journey timeline</li>
    <li>Weekly plan updates based on your real progress</li>
  </ul>
  <h2 style="margin:28px 0 10px;font-size:18px;">Plans</h2>
  <ol style="margin:0 0 8px;padding-left:18px;">
    <li style="margin-bottom:10px;"><strong>3 Months — ₹999</strong> (≈ ₹333/month · SAVE ₹498)<br/><a href="${APP}/plans/3-months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — ₹1699</strong> (≈ ₹283/month · SAVE ₹1,295) · Most popular<br/><a href="${APP}/plans/6-months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — ₹2999</strong> (≈ ₹250/month · SAVE ₹2,989) · Best value<br/><a href="${APP}/plans/12-months">Start 12 Months →</a></li>
  </ol>
  <p style="margin:24px 0 8px;color:#444;">After payment: create account → assessment + photos → personal plan delivered within 24–48 hours.</p>
  <p style="margin:0;"><a href="/">Or view plans on the homepage →</a></p>
</div>`

const pages = await gql(`{ pages(first:50){nodes{id handle title}}}`)
const plans = pages.pages.nodes.find((p) => p.handle === 'plans')
const coaching = pages.pages.nodes.find((p) => p.handle === 'coaching-plans')
if (!coaching) throw new Error('coaching-plans missing')

await gql(
  `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){page{handle} userErrors{message}}}`,
  { id: coaching.id, page: { body, title: 'PLANS', isPublished: true } }
)
console.log('coaching-plans body updated + titled PLANS')

if (plans) {
  // Rename away so /pages/plans can become a redirect
  const r = await gql(
    `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){page{handle} userErrors{message}}}`,
    {
      id: plans.id,
      page: {
        handle: `plans-cached-${Date.now()}`,
        isPublished: false,
        title: 'PLANS cached archive',
      },
    }
  )
  console.log('archived plans page', r.pageUpdate)
}

// Create redirect
const existing = await fetch(`${REST}/redirects.json?limit=250`, { headers }).then((r) => r.json())
const already = (existing.redirects || []).find((r) => r.path === '/pages/plans')
if (already) {
  const del = await fetch(`${REST}/redirects/${already.id}.json`, {
    method: 'DELETE',
    headers,
  })
  console.log('deleted old redirect', del.status)
}

const created = await fetch(`${REST}/redirects.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    redirect: { path: '/pages/plans', target: '/pages/coaching-plans' },
  }),
}).then(async (r) => ({ status: r.status, body: await r.text() }))
console.log('redirect create', created.status, created.body.slice(0, 300))

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const res = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
    redirect: 'follow',
  })
  const html = await res.text()
  const finalUrl = res.url
  const has1 = /1 Month\s*—/.test(html)
  const has3 = /3 Months\s*—/.test(html)
  console.log(i, { finalUrl, status: res.status, has1, has3 })
  if (!has1 && has3) {
    console.log('PLANS REDIRECT SUCCESS')
    break
  }
}

// Verify coaching-plans directly
const coachingHtml = await fetch(`https://www.lurvox.in/pages/coaching-plans?cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
console.log('coaching-plans direct', {
  has1: /1 Month\s*—/.test(coachingHtml),
  has3: /3 Months\s*—/.test(coachingHtml),
})
