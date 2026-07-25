/**
 * Update Shopify Plans page with current prices + full inclusions.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const body = `
<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
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
    <li style="margin-bottom:10px;"><strong>1 Month — ₹499</strong> (₹499/month)<br/><a href="${APP}/checkout?plan=1_month">Start 1 Month →</a></li>
    <li style="margin-bottom:10px;"><strong>3 Months — ₹999</strong> (≈ ₹333/month · SAVE ₹498)<br/><a href="${APP}/checkout?plan=3_months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — ₹1699</strong> (≈ ₹283/month · SAVE ₹1,295) · Most popular<br/><a href="${APP}/checkout?plan=6_months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — ₹2999</strong> (≈ ₹250/month · SAVE ₹2,989) · Best value<br/><a href="${APP}/checkout?plan=12_months">Start 12 Months →</a></li>
  </ol>

  <p style="margin:24px 0 8px;color:#444;">After payment: create account → assessment + photos → personal plan delivered within 24–48 hours.</p>
  <p style="margin:0;"><a href="/#shopify-section-blocks_C9E4qf">Or view plans on the homepage →</a></p>
  <p style="margin:20px 0 0;font-size:14px;color:#666;">Questions before paying? <a href="/pages/talk-to-a-coach">Talk to a coach</a> or WhatsApp <a href="https://wa.me/919220451577">+91 92204 51577</a>.</p>
</div>
`.trim()

const pages = await gql(`{ pages(first: 30) { nodes { id handle title } } }`)
const plans = pages.pages.nodes.find((p) => p.handle === 'plans')
if (!plans) throw new Error('Plans page not found')

const result = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }`,
  {
    id: plans.id,
    page: {
      title: 'PLANS',
      body,
      isPublished: true,
    },
  }
)

if (result.pageUpdate.userErrors?.length) {
  throw new Error(JSON.stringify(result.pageUpdate.userErrors, null, 2))
}

console.log('Updated page', result.pageUpdate.page)

// Mirror key copy onto coaching-plans if it exists and is empty-ish
const coachingPlans = pages.pages.nodes.find((p) => p.handle === 'coaching-plans')
if (coachingPlans) {
  const mirror = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    {
      id: coachingPlans.id,
      page: {
        title: 'COACHING PLANS',
        body,
        isPublished: true,
      },
    }
  )
  if (mirror.pageUpdate.userErrors?.length) {
    console.warn('coaching-plans errors', mirror.pageUpdate.userErrors)
  } else {
    console.log('Updated coaching-plans page too')
  }
}

console.log('Done')
