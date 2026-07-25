/**
 * Polish draft theme: prices, CTAs, FAB, plans page, menu login, rename.
 * Does not print tokens.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'
const WA =
  'https://wa.me/919220451577?text=I%20have%20doubts%20and%20want%20a%20chat%20before%20payment.'
const CONSULT = '/pages/talk-to-a-coach'
const PRICING_ANCHOR = '/#shopify-section-blocks_C9E4qf'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-draft-theme.json'), 'utf8')
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
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

function applyPlanPrices(index) {
  let block = index.sections?.blocks_C9E4qf?.blocks?.ai_gen_block_361650c_qqYKXh

  if (!block) {
    for (const section of Object.values(index.sections || {})) {
      for (const [key, candidate] of Object.entries(section.blocks || {})) {
        if (
          candidate?.type === 'ai_gen_block_361650c' ||
          key.includes('361650c') ||
          candidate?.settings?.plan_1_link
        ) {
          block = candidate
          break
        }
      }
      if (block) break
    }
  }

  if (!block?.settings) throw new Error('Pricing block not found in index.json')

  const s = block.settings
  s.plan_1_price = '500'
  s.plan_1_monthly = '₹500/month'
  s.plan_1_original_price = ''
  s.plan_1_savings = ''

  s.plan_2_price = '900'
  s.plan_2_original_price = '1500'
  s.plan_2_savings = 'SAVE ₹600'
  s.plan_2_monthly = '≈ ₹300/month'

  s.plan_3_price = '1500'
  s.plan_3_original_price = '3000'
  s.plan_3_savings = 'SAVE ₹1,500'
  s.plan_3_monthly = '≈ ₹250/month'

  s.plan_4_price = '2400'
  s.plan_4_original_price = '6000'
  s.plan_4_savings = 'SAVE ₹3,600'
  s.plan_4_monthly = '≈ ₹200/month'

  // Keep checkout links on app
  s.plan_1_link = `${APP}/checkout?plan=1_month`
  s.plan_2_link = `${APP}/checkout?plan=3_months`
  s.plan_3_link = `${APP}/checkout?plan=6_months`
  s.plan_4_link = `${APP}/checkout?plan=12_months`
}

function applyChoosePlanCtas(index) {
  let count = 0
  for (const section of Object.values(index.sections || {})) {
    for (const block of Object.values(section.blocks || {})) {
      if (block?.settings?.button_link === 'shopify://pages/plans') {
        block.settings.button_link = PRICING_ANCHOR
        count++
      }
    }
  }
  return count
}

function applyFabSettings(footer) {
  const sections = footer.sections || {}
  let fab =
    sections.mobile_floating_bar ||
    Object.values(sections).find((s) => s?.type === 'mobile-floating-bar')

  if (!fab) {
    // Add section if missing (draft may have lost wiring)
    sections.mobile_floating_bar = {
      type: 'mobile-floating-bar',
      settings: {
        enabled: true,
        payment_help_url: WA,
        consultation_url: CONSULT,
        background_color: '#050505',
        accent_color: '#FF6200',
        bottom_spacing: 20,
        border_radius: 24,
        shadow_strength: 100,
      },
    }
    footer.sections = sections
    footer.order = [...(footer.order || []), 'mobile_floating_bar']
    fab = sections.mobile_floating_bar
  }

  fab.settings = {
    ...fab.settings,
    enabled: true,
    payment_help_url: WA,
    consultation_url: CONSULT,
  }
}

function patchFabLiquid(liquid) {
  let out = liquid
  // Hide on consult/contact pages
  if (!out.includes("request.page_type == 'page'")) {
    out = out.replace(
      `assign hide_template = false
  if request.page_type == 'cart' or request.page_type == 'password'
    assign hide_template = true
  endif`,
      `assign hide_template = false
  if request.page_type == 'cart' or request.page_type == 'password'
    assign hide_template = true
  endif
  if request.page_type == 'page' and page.handle == 'talk-to-a-coach'
    assign hide_template = true
  endif
  if request.page_type == 'page' and page.handle == 'contact'
    assign hide_template = true
  endif`
    )
  }
  // Ensure WA / consult defaults
  out = out.replace(
    /if payment_url == blank\s*\n\s*assign payment_url = '[^']*'/,
    `if payment_url == blank\n    assign payment_url = '${WA}'`
  )
  out = out.replace(
    /if consult_url == blank\s*\n\s*assign consult_url = '[^']*'/,
    `if consult_url == blank\n    assign consult_url = '${CONSULT}'`
  )
  return out
}

function rewritePlansBody(body) {
  if (!body) return body
  let next = body
  // Common Razorpay payment page patterns → app checkout
  next = next.replace(/https:\/\/rzp\.io\/[^\s"'<]+/gi, (url) => {
    const lower = url.toLowerCase()
    if (/1|month|499|500/.test(lower)) return `${APP}/checkout?plan=1_month`
    if (/3|900|999/.test(lower)) return `${APP}/checkout?plan=3_months`
    if (/6|1500|1699/.test(lower)) return `${APP}/checkout?plan=6_months`
    if (/12|2400|2999/.test(lower)) return `${APP}/checkout?plan=12_months`
    return `${APP}/checkout?plan=6_months`
  })
  // Absolute shopify plans self-links stay; replace bare checkout mentions
  next = next.replace(/https?:\/\/(?:www\.)?lurvox\.in\/pages\/plans/gi, PRICING_ANCHOR)
  return next
}

async function upsertThemeFiles(files) {
  const data = await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId: draft.draftThemeId,
      files: files.map((f) => ({
        filename: f.filename,
        body: { type: 'TEXT', value: f.value },
      })),
    }
  )
  const errors = data.themeFilesUpsert.userErrors || []
  if (errors.length) throw new Error(JSON.stringify(errors, null, 2))
  return data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
}

async function renameTheme(name) {
  const data = await gql(
    `mutation themeUpdate($id: ID!, $input: OnlineStoreThemeInput!) {
      themeUpdate(id: $id, input: $input) {
        theme { id name }
        userErrors { field message }
      }
    }`,
    { id: draft.draftThemeId, input: { name } }
  )
  if (data.themeUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(data.themeUpdate.userErrors, null, 2))
  }
  return data.themeUpdate.theme.name
}

async function ensureLoginMenuItem() {
  try {
    const data = await gql(`{
      menus(first: 20) {
        nodes {
          id
          handle
          title
          items {
            id
            title
            url
            type
            resourceId
            items { id title url type }
          }
        }
      }
    }`)

    const menu =
      data.menus.nodes.find((m) => m.handle === 'main-menu') ||
      data.menus.nodes.find((m) => /main/i.test(m.handle)) ||
      data.menus.nodes[0]

    if (!menu) {
      console.log('menu: none found, skip login link')
      return false
    }

    const hasLogin = (menu.items || []).some(
      (item) =>
        /login|client|member/i.test(item.title || '') ||
        (item.url || '').includes('app.lurvox.in/login')
    )
    if (hasLogin) {
      console.log('menu: login already present')
      return true
    }

    const items = (menu.items || []).map((item) => ({
      title: item.title,
      type: item.type || 'HTTP',
      url: item.url,
      resourceId: item.resourceId || null,
      items: (item.items || []).map((child) => ({
        title: child.title,
        type: child.type || 'HTTP',
        url: child.url,
        resourceId: child.resourceId || null,
      })),
    }))

    items.push({
      title: 'Client Login',
      type: 'HTTP',
      url: `${APP}/login`,
      resourceId: null,
      items: [],
    })

    const updated = await gql(
      `mutation menuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`,
      {
        id: menu.id,
        title: menu.title,
        handle: menu.handle,
        items,
      }
    )

    if (updated.menuUpdate.userErrors?.length) {
      console.log('menu update errors:', JSON.stringify(updated.menuUpdate.userErrors))
      return false
    }
    console.log('menu: added Client Login →', menu.handle)
    return true
  } catch (e) {
    console.log('menu: skipped (' + String(e.message || e).slice(0, 120) + ')')
    return false
  }
}

async function updatePlansPage() {
  const data = await gql(`{
    pages(first: 50) {
      nodes { id title handle body }
    }
  }`)
  const plans = data.pages.nodes.find((p) => p.handle === 'plans')
  if (!plans) {
    console.log('pages: no plans page found')
    return
  }

  const nextBody = rewritePlansBody(plans.body || '')
  // Also inject a clear CTA block if body still lacks app links
  let body = nextBody
  if (!/app\.lurvox\.in\/checkout/i.test(body)) {
    body += `
<div style="max-width:640px;margin:32px auto;padding:24px;text-align:center;font-family:system-ui,sans-serif">
  <h2>Choose your LURVOX plan</h2>
  <p>Secure checkout on the LURVOX app.</p>
  <p><a href="${APP}/checkout?plan=1_month">1 Month — ₹500</a></p>
  <p><a href="${APP}/checkout?plan=3_months">3 Months — ₹900</a></p>
  <p><a href="${APP}/checkout?plan=6_months">6 Months — ₹1,500</a></p>
  <p><a href="${APP}/checkout?plan=12_months">12 Months — ₹2,400</a></p>
  <p><a href="${PRICING_ANCHOR}">Or view plans on the homepage</a></p>
</div>`
  }

  if (body === plans.body) {
    console.log('pages: plans page already up to date')
    return
  }

  const updated = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    { id: plans.id, page: { body } }
  )
  if (updated.pageUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(updated.pageUpdate.userErrors, null, 2))
  }
  console.log('pages: updated /pages/plans')
}

async function addFooterLoginLink(footer) {
  // Prefer not to deeply mutate complex footer blocks; add a utilities note if missing.
  const raw = JSON.stringify(footer)
  if (raw.includes('app.lurvox.in/login')) return false

  // Find a text block we can append near utilities if present
  const utils = footer.sections?.footer_utilities_jLGE8U
  if (!utils) return false

  // Many Horizon footers store links in menu settings; skip structural inventing.
  return false
}

async function main() {
  console.log('draft:', draft.draftThemeName, draft.draftThemeId)

  const fileData = await gql(
    `query ($id: ID!, $filenames: [String!]!) {
      theme(id: $id) {
        name
        role
        files(filenames: $filenames) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }`,
    {
      id: draft.draftThemeId,
      filenames: [
        'templates/index.json',
        'sections/footer-group.json',
        'sections/mobile-floating-bar.liquid',
      ],
    }
  )

  const byName = Object.fromEntries(
    fileData.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
  )

  const index = JSON.parse(stripAutoHeader(byName['templates/index.json']))
  const footer = JSON.parse(stripAutoHeader(byName['sections/footer-group.json']))
  let fabLiquid =
    byName['sections/mobile-floating-bar.liquid'] ||
    fs.readFileSync(
      path.join('C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid'),
      'utf8'
    )

  applyPlanPrices(index)
  const ctaCount = applyChoosePlanCtas(index)
  applyFabSettings(footer)
  fabLiquid = patchFabLiquid(fabLiquid)
  addFooterLoginLink(footer)

  // Prefer local polished FAB if newer (JS position fix)
  const localFab = fs.readFileSync(
    path.join('C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid'),
    'utf8'
  )
  fabLiquid = patchFabLiquid(localFab)

  const uploaded = await upsertThemeFiles([
    {
      filename: 'templates/index.json',
      value: JSON.stringify(index, null, 2) + '\n',
    },
    {
      filename: 'sections/footer-group.json',
      value: JSON.stringify(footer, null, 2) + '\n',
    },
    {
      filename: 'sections/mobile-floating-bar.liquid',
      value: fabLiquid,
    },
  ])
  console.log('uploaded:', uploaded.join(', '))
  console.log('choose-plan CTAs retargeted:', ctaCount)

  await updatePlansPage()
  await ensureLoginMenuItem()

  try {
    const name = await renameTheme('LURVOX Draft')
    console.log('renamed theme →', name)
    draft.draftThemeName = name
    fs.writeFileSync(
      path.join(process.env.TEMP, 'shopify-draft-theme.json'),
      JSON.stringify({ ...draft, draftThemeName: name, updatedAt: new Date().toISOString() }, null, 2)
    )
  } catch (e) {
    console.log('rename skipped:', String(e.message || e).slice(0, 200))
  }

  // Sync local copies for reference
  fs.writeFileSync(
    path.join('C:/Users/DELL/coaching-platform/scripts/tmp-draft-templates-index.json'),
    JSON.stringify(index, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join('C:/Users/DELL/coaching-platform/scripts/tmp-draft-sections-footer-group.json'),
    JSON.stringify(footer, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join('C:/Users/DELL/coaching-platform/scripts/mobile-floating-bar.liquid'),
    fabLiquid
  )

  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
