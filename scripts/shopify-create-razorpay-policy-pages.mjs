/**
 * Create/update Razorpay-required policy pages on Shopify + footer links.
 * Required: Privacy, Terms, Refund/Cancellation, Shipping/Delivery, Contact, Pricing, About.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const SITE = 'https://www.lurvox.in'
const APP = 'https://app.lurvox.in'
const WA = 'https://wa.me/919220451577'
const PHONE = '+91 92204 51577'
const EMAIL = 'support@lurvox.in'
/** Replace with your legal registered business address before Razorpay KYC submission. */
const ADDRESS_LINE =
  'LURVOX — India (Registered business address to be displayed for support & compliance). Contact via WhatsApp or email below for the full registered address details.'

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

function wrap(title, innerHtml) {
  return `
<div style="max-width:760px;margin:0 auto;padding:28px 16px 48px;color:#111;line-height:1.65;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="margin:0 0 8px;letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;">LURVOX</p>
  <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;">${title}</h1>
  <p style="margin:0 0 24px;color:#666;font-size:14px;">Last updated: 20 July 2026</p>
  ${innerHtml}
  <p style="margin:32px 0 0;font-size:14px;color:#666;">Questions? <a href="${WA}">WhatsApp ${PHONE}</a> · <a href="mailto:${EMAIL}">${EMAIL}</a> · <a href="${SITE}/pages/contact">Contact</a></p>
</div>`.trim()
}

const pages = [
  {
    handle: 'privacy-policy',
    title: 'Privacy Policy',
    body: wrap(
      'Privacy Policy',
      `
<p>This Privacy Policy explains how LURVOX ("we", "us", "our") collects, uses, and protects your information when you use <a href="${SITE}">${SITE}</a>, our coaching app at <a href="${APP}">${APP}</a>, and related payment flows.</p>
<h2>Information we collect</h2>
<ul>
  <li><strong>Account & identity:</strong> name, email address, phone number (if provided), and login credentials.</li>
  <li><strong>Payment information:</strong> payment status, order/payment IDs, and plan purchased. Card/UPI details are processed by Razorpay — we do not store full card numbers on our servers.</li>
  <li><strong>Coaching data:</strong> onboarding answers, goals, diet preferences, progress photos, measurements, check-ins, tracker logs, and chat messages with your coach.</li>
  <li><strong>Technical data:</strong> device/browser type, IP address, and basic usage logs needed for security and support.</li>
</ul>
<h2>How we use your information</h2>
<ul>
  <li>To create and manage your coaching account and deliver personalised workout and diet plans.</li>
  <li>To process payments, prevent fraud, and provide purchase support.</li>
  <li>To enable coach communication, weekly check-ins, plan updates, and progress tracking.</li>
  <li>To send service messages (account, payment, plan delivery, support). Marketing messages are optional and can be stopped on request.</li>
  <li>To improve product quality, security, and customer support.</li>
</ul>
<h2>Sharing of information</h2>
<ul>
  <li><strong>Coaches / support staff</strong> assigned to your account (to deliver coaching).</li>
  <li><strong>Payment processor:</strong> Razorpay (to complete checkout and settlements).</li>
  <li><strong>Infrastructure providers</strong> that host our app/database (under contractual confidentiality).</li>
  <li>We do <strong>not sell</strong> your personal data.</li>
  <li>We may disclose information if required by law or to protect rights, safety, and security.</li>
</ul>
<h2>Data retention & security</h2>
<p>We retain account and coaching records for as long as your account is active and as needed for legal, tax, dispute, and service purposes. We use reasonable technical and organisational measures to protect your data. No method of transmission is 100% secure.</p>
<h2>Your choices</h2>
<ul>
  <li>You may request access, correction, or deletion of your account data by contacting us.</li>
  <li>You may stop coaching / request cancellation via WhatsApp support.</li>
  <li>Progress photos and health-related coaching inputs are used only to deliver coaching services.</li>
</ul>
<h2>Children</h2>
<p>Our services are intended for adults. If you believe a minor has created an account, contact us and we will take appropriate action.</p>
<h2>Contact for privacy requests</h2>
<p>Email: <a href="mailto:${EMAIL}">${EMAIL}</a><br/>WhatsApp: <a href="${WA}">${PHONE}</a><br/>Website: <a href="${SITE}/pages/contact">Contact Us</a></p>
`
    ),
  },
  {
    handle: 'terms-and-conditions',
    title: 'Terms and Conditions',
    body: wrap(
      'Terms and Conditions',
      `
<p>By purchasing or using LURVOX coaching services via <a href="${SITE}">${SITE}</a> or <a href="${APP}">${APP}</a>, you agree to these Terms.</p>
<h2>Service description</h2>
<p>LURVOX provides online fitness coaching, including personalised workout and diet guidance, weekly coach check-ins, daily tracking tools, coach chat, and plan updates. Coaching is delivered digitally through our app after payment and account setup.</p>
<h2>Eligibility</h2>
<ul>
  <li>You must be 18+ (or have legal guardian consent where applicable).</li>
  <li>You confirm information you provide (health, injuries, preferences) is accurate.</li>
  <li>You are responsible for consulting a doctor before starting any exercise or diet program if you have medical conditions.</li>
</ul>
<h2>Accounts & access</h2>
<ul>
  <li>After payment you create an account, complete onboarding (including photos where requested), and receive coaching access for the plan duration purchased.</li>
  <li>You must keep login credentials confidential.</li>
  <li>Sharing accounts or reselling plans is not allowed.</li>
</ul>
<h2>Payments</h2>
<ul>
  <li>Prices are listed in INR on our website/app and include the coaching package selected.</li>
  <li>Payments are processed securely via Razorpay.</li>
  <li>Access begins after successful payment and account setup.</li>
</ul>
<h2>Results disclaimer</h2>
<p>Results vary. Coaching effectiveness depends on consistency, adherence, sleep, stress, and individual factors. We do not guarantee specific weight loss, muscle gain, or medical outcomes.</p>
<h2>Acceptable use</h2>
<p>Do not misuse chat, upload illegal content, harass coaches/staff, or attempt to disrupt the platform. We may suspend accounts that violate these Terms.</p>
<h2>Intellectual property</h2>
<p>Plans, content, branding, and app materials remain LURVOX property. Personal use only — no redistribution.</p>
<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, LURVOX is not liable for indirect or consequential damages. Our total liability related to a purchase is limited to the amount you paid for that purchase.</p>
<h2>Governing law</h2>
<p>These Terms are governed by the laws of India. Disputes are subject to the courts of competent jurisdiction in India.</p>
<h2>Contact</h2>
<p><a href="mailto:${EMAIL}">${EMAIL}</a> · WhatsApp <a href="${WA}">${PHONE}</a></p>
`
    ),
  },
  {
    handle: 'refund-and-cancellation-policy',
    title: 'Refund and Cancellation Policy',
    body: wrap(
      'Refund and Cancellation Policy',
      `
<p>This policy applies to LURVOX digital coaching plan purchases made via <a href="${SITE}">${SITE}</a> / <a href="${APP}">${APP}</a>.</p>
<h2>Nature of the product</h2>
<p>LURVOX sells <strong>digital coaching services</strong> (personalised plans, coach support, trackers, chat). There is no physical product shipment.</p>
<h2>Cancellation</h2>
<ul>
  <li>You may request cancellation anytime by WhatsApp at <a href="${WA}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a>.</li>
  <li>Cancellation stops future coaching continuation beyond your paid period; it does not automatically create a refund unless eligible below.</li>
</ul>
<h2>Refund eligibility</h2>
<ul>
  <li><strong>Duplicate / failed payment:</strong> If you were charged more than once for the same order, or charged but access was not created due to a technical failure on our side, we will refund the duplicate/failed amount within <strong>5–7 business days</strong> after verification.</li>
  <li><strong>Plan not delivered:</strong> If you completed payment + account + onboarding, and we fail to deliver your first personalised plan within <strong>48 hours</strong> of onboarding completion (excluding delays caused by incomplete photos/information from your side), you may request a full refund within <strong>7 days</strong> of purchase.</li>
  <li><strong>After plan delivery:</strong> Once your personalised diet/workout plan has been delivered and/or you have started using coaching chat/check-ins, fees are generally <strong>non-refundable</strong> because the service has been rendered.</li>
</ul>
<h2>How to request a refund</h2>
<ol>
  <li>Message WhatsApp <a href="${WA}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a> with your registered email and Razorpay payment ID (starts with <code>pay_</code>).</li>
  <li>Our team verifies payment and eligibility within <strong>2–3 business days</strong>.</li>
  <li>Approved refunds are initiated to the original payment method and typically reflect in <strong>5–7 business days</strong> (bank timelines may vary).</li>
</ol>
<h2>Non-refundable cases</h2>
<ul>
  <li>Change of mind after plan delivery or after using coaching features.</li>
  <li>Failure to follow the plan / missed workouts.</li>
  <li>Incomplete onboarding or missing required photos/information from the client.</li>
  <li>Chargebacks filed without contacting support first (we encourage resolving via WhatsApp/email).</li>
</ul>
`
    ),
  },
  {
    handle: 'shipping-policy',
    title: 'Shipping and Delivery Policy',
    body: wrap(
      'Shipping and Delivery Policy',
      `
<p>LURVOX provides <strong>digital coaching services only</strong>. We do not ship physical goods.</p>
<h2>What is delivered</h2>
<ul>
  <li>Account access on <a href="${APP}">${APP}</a></li>
  <li>Personalised workout plan and diet plan</li>
  <li>Weekly coach check-ins, coach chat, daily trackers, progress tools</li>
</ul>
<h2>Delivery timeline</h2>
<ol>
  <li><strong>Immediate:</strong> After successful payment you can create/claim your account.</li>
  <li><strong>After onboarding + photos:</strong> Your first personalised plan is typically delivered within <strong>24 hours</strong> (up to <strong>48 hours</strong> in peak periods).</li>
  <li>Ongoing coaching (check-ins, chat, updates) continues through your purchased plan duration.</li>
</ol>
<h2>Delivery method</h2>
<p>All deliverables are provided digitally inside the LURVOX client app. No courier or postal shipping applies.</p>
<h2>Delays</h2>
<p>If delivery is delayed beyond the timeline above due to our side, contact WhatsApp <a href="${WA}">${PHONE}</a> or <a href="mailto:${EMAIL}">${EMAIL}</a>. See also our <a href="${SITE}/pages/refund-and-cancellation-policy">Refund and Cancellation Policy</a>.</p>
`
    ),
  },
  {
    handle: 'contact',
    title: 'Contact',
    body: wrap(
      'Contact Us',
      `
<p>We are here to help with payments, coaching access, and support.</p>
<h2>Support channels</h2>
<ul>
  <li><strong>WhatsApp:</strong> <a href="${WA}">${PHONE}</a></li>
  <li><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a></li>
  <li><strong>Talk to a coach:</strong> <a href="${SITE}/pages/talk-to-a-coach">Request a free consultation</a></li>
  <li><strong>Client app login:</strong> <a href="${APP}/login">${APP}/login</a></li>
</ul>
<h2>Business / registered address</h2>
<p>${ADDRESS_LINE}</p>
<p><strong>Brand:</strong> LURVOX<br/><strong>Website:</strong> <a href="${SITE}">${SITE}</a><br/><strong>App:</strong> <a href="${APP}">${APP}</a></p>
<h2>Response time</h2>
<p>We typically respond within <strong>24 hours</strong> on business days.</p>
`
    ),
  },
  {
    handle: 'about-us',
    title: 'About Us',
    body: wrap(
      'About LURVOX',
      `
<p>LURVOX is an online fitness coaching platform that helps people get personalised workout and diet coaching without luxury-studio pricing.</p>
<h2>What we do</h2>
<ul>
  <li>Personal workout plans (gym, home, or both)</li>
  <li>Personal diet plans (including vegetarian and allergy-friendly options)</li>
  <li>Weekly coach check-ins and plan updates</li>
  <li>Daily trackers and direct coach chat in our client app</li>
</ul>
<h2>How it works</h2>
<ol>
  <li>Choose a plan and complete secure checkout.</li>
  <li>Create your account and finish onboarding with progress photos.</li>
  <li>Receive your personalised plan and start coaching with weekly reviews.</li>
</ol>
<p>Explore plans: <a href="${SITE}/pages/plans">${SITE}/pages/plans</a></p>
`
    ),
  },
  {
    handle: 'pricing',
    title: 'Pricing',
    body: wrap(
      'Pricing',
      `
<p>All prices are in Indian Rupees (INR). Every plan includes the same complete coaching: personal workout + diet, weekly check-ins, daily trackers, coach chat, progress photos/journey, and weekly plan updates.</p>
<h2>Current plans</h2>
<ul>
  <li><strong>1 Month — ₹499</strong> (<a href="${APP}/checkout?plan=1_month">Checkout</a>)</li>
  <li><strong>3 Months — ₹999</strong> ≈ ₹333/month · SAVE ₹498 (<a href="${APP}/checkout?plan=3_months">Checkout</a>)</li>
  <li><strong>6 Months — ₹1699</strong> ≈ ₹283/month · SAVE ₹1,295 · Most popular (<a href="${APP}/checkout?plan=6_months">Checkout</a>)</li>
  <li><strong>12 Months — ₹2999</strong> ≈ ₹250/month · SAVE ₹2,989 · Best value (<a href="${APP}/checkout?plan=12_months">Checkout</a>)</li>
</ul>
<p>Also see: <a href="${SITE}/pages/plans">Plans</a> · Homepage pricing section: <a href="${SITE}/#shopify-section-blocks_C9E4qf">${SITE}</a></p>
<p>Payments are processed securely via Razorpay. For refunds, see our <a href="${SITE}/pages/refund-and-cancellation-policy">Refund and Cancellation Policy</a>.</p>
`
    ),
  },
]

async function upsertPage({ handle, title, body }) {
  const existing = await gql(
    `{ pages(first: 50, query: "handle:${handle}") { nodes { id handle title } } }`
  )
  // query filter may not work — fallback scan
  const all = await gql(`{ pages(first: 50) { nodes { id handle title } } }`)
  const found =
    existing.pages.nodes.find((p) => p.handle === handle) ||
    all.pages.nodes.find((p) => p.handle === handle)

  if (found) {
    const result = await gql(
      `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle title }
          userErrors { field message }
        }
      }`,
      { id: found.id, page: { title, body, isPublished: true, handle } }
    )
    if (result.pageUpdate.userErrors?.length) {
      throw new Error(`${handle}: ${JSON.stringify(result.pageUpdate.userErrors)}`)
    }
    console.log('Updated', handle, result.pageUpdate.page.id)
    return result.pageUpdate.page
  }

  const result = await gql(
    `mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle title }
        userErrors { field message }
      }
    }`,
    {
      page: {
        title,
        handle,
        body,
        isPublished: true,
      },
    }
  )
  if (result.pageCreate.userErrors?.length) {
    throw new Error(`${handle}: ${JSON.stringify(result.pageCreate.userErrors)}`)
  }
  console.log('Created', handle, result.pageCreate.page.id)
  return result.pageCreate.page
}

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

async function ensureFooterLinks(pageHandles) {
  const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
  const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
  if (!main) throw new Error('No MAIN theme')

  const fileData = await gql(
    `query ($id: ID!, $filenames: [String!]!) {
      theme(id: $id) {
        files(filenames: $filenames) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: main.id, filenames: ['sections/footer-group.json'] }
  )
  const raw = fileData.theme.files.nodes[0]?.body?.content
  if (!raw) {
    console.warn('No footer-group.json — skip footer update')
    return
  }

  const footer = JSON.parse(stripAutoHeader(raw))
  // Try to find a menu / link list block and append policy links as text blocks if schema allows.
  // Horizon footers vary; we also upsert a dedicated footer policy text block if present.
  let updated = false
  for (const section of Object.values(footer.sections || {})) {
    for (const block of Object.values(section.blocks || {})) {
      const s = block.settings || {}
      // Common custom HTML / richtext fields
      for (const key of Object.keys(s)) {
        if (
          typeof s[key] === 'string' &&
          (key.includes('text') || key.includes('html') || key.includes('content')) &&
          s[key].length > 20 &&
          /privacy|terms|contact|copyright|all rights/i.test(s[key])
        ) {
          const links = pageHandles
            .map((h) => {
              const label = h
                .split('-')
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(' ')
              return `<a href="/pages/${h}">${label}</a>`
            })
            .join(' · ')
          if (!s[key].includes('/pages/privacy-policy')) {
            s[key] = `${s[key]}<br/><p style="margin-top:12px;font-size:13px;">${links}</p>`
            updated = true
          }
        }
      }
    }
  }

  // Also try Shopify menus
  const menus = await gql(`{
    menus(first: 20) {
      nodes { id handle title items { id title url } }
    }
  }`)
  const footerMenu =
    menus.menus.nodes.find((m) => /footer/i.test(m.handle) || /footer/i.test(m.title)) ||
    menus.menus.nodes.find((m) => m.handle === 'footer')

  if (footerMenu) {
    const existingTitles = new Set(footerMenu.items.map((i) => i.title.toLowerCase()))
    const wanted = [
      { title: 'Privacy Policy', url: `${SITE}/pages/privacy-policy` },
      { title: 'Terms and Conditions', url: `${SITE}/pages/terms-and-conditions` },
      { title: 'Refund Policy', url: `${SITE}/pages/refund-and-cancellation-policy` },
      { title: 'Shipping Policy', url: `${SITE}/pages/shipping-policy` },
      { title: 'Contact', url: `${SITE}/pages/contact` },
      { title: 'Pricing', url: `${SITE}/pages/pricing` },
      { title: 'About Us', url: `${SITE}/pages/about-us` },
    ]
    const items = [
      ...footerMenu.items.map((i) => ({ title: i.title, url: i.url, type: 'HTTP' })),
    ]
    for (const w of wanted) {
      if (![...existingTitles].some((t) => t.includes(w.title.split(' ')[0].toLowerCase()))) {
        items.push({ title: w.title, url: w.url, type: 'HTTP' })
      }
    }
    const menuUpdate = await gql(
      `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`,
      {
        id: footerMenu.id,
        title: footerMenu.title,
        items: items.map((i) => ({
          title: i.title,
          type: 'HTTP',
          url: i.url,
        })),
      }
    )
    if (menuUpdate.menuUpdate.userErrors?.length) {
      console.warn('menuUpdate errors', menuUpdate.menuUpdate.userErrors)
    } else {
      console.log('Updated footer menu', footerMenu.handle)
      updated = true
    }
  } else {
    // Create a footer policies menu
    const created = await gql(
      `mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`,
      {
        title: 'Policies',
        handle: 'policies',
        items: [
          { title: 'Privacy Policy', type: 'HTTP', url: `${SITE}/pages/privacy-policy` },
          { title: 'Terms and Conditions', type: 'HTTP', url: `${SITE}/pages/terms-and-conditions` },
          {
            title: 'Refund Policy',
            type: 'HTTP',
            url: `${SITE}/pages/refund-and-cancellation-policy`,
          },
          { title: 'Shipping Policy', type: 'HTTP', url: `${SITE}/pages/shipping-policy` },
          { title: 'Contact', type: 'HTTP', url: `${SITE}/pages/contact` },
          { title: 'Pricing', type: 'HTTP', url: `${SITE}/pages/pricing` },
          { title: 'About Us', type: 'HTTP', url: `${SITE}/pages/about-us` },
        ],
      }
    )
    if (created.menuCreate.userErrors?.length) {
      console.warn('menuCreate errors', created.menuCreate.userErrors)
    } else {
      console.log('Created policies menu', created.menuCreate.menu?.handle)
    }
  }

  if (updated && raw) {
    const next = JSON.stringify(footer, null, 2)
    const upsert = await gql(
      `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      {
        themeId: main.id,
        files: [{ filename: 'sections/footer-group.json', body: { type: 'TEXT', value: next } }],
      }
    )
    if (upsert.themeFilesUpsert.userErrors?.length) {
      console.warn('footer upsert errors', upsert.themeFilesUpsert.userErrors)
    } else {
      console.log('Saved footer-group.json')
    }
  }
}

const created = []
for (const page of pages) {
  created.push(await upsertPage(page))
}

await ensureFooterLinks(pages.map((p) => p.handle))

console.log('\n=== Razorpay checklist URLs ===')
for (const p of pages) {
  console.log(`${p.title}: ${SITE}/pages/${p.handle}`)
}
console.log('\nDone')
