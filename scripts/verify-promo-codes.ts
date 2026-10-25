/**
 * Verifies promo / referral code helpers.
 * Run: npx tsx scripts/verify-promo-codes.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  affiliateDiscountPaise,
  affiliateSalePaise,
  getAffiliateCode,
  isAffiliateDiscountCode,
} from '../src/lib/payments/affiliate-codes'
import {
  computePromoDiscountPaise,
  isPromoCodeCurrentlyValid,
  normalizePromoCode,
} from '../src/lib/payments/promo-codes'
import {
  expectedAmountPaiseFromOrderNotes,
  isRetiredPublicDiscountCode,
  isPublicSaleCode,
  publicSaleDiscountPaise,
} from '../src/lib/payments/checkout-discounts'
import { COACHING_PLANS, DURATION_OFFER_PLANS } from '../src/lib/payments/plans'
import { isPreviewSaleCode, previewSaleDiscountPaise } from '../src/lib/payments/preview-sale-code'
import { preview7MarkedUpPaise, preview7PricedPlan } from '../src/lib/payments/preview7-prices'
import { injectPreview7Tracking } from '../src/lib/landing/preview7-tracking'
import { preview7LiveHtml } from '../src/lib/landing/preview7-html'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(normalizePromoCode('  summer 200 '), 'SUMMER200')
pass('normalizes promo codes')

const fixed = computePromoDiscountPaise(
  {
    discount_type: 'fixed',
    discount_paise: 25000,
    discount_percent: 0,
    plan_discounts_paise: {},
    applicable_plans: null,
  },
  '3_months',
  149900
)
assert.equal(fixed, 25000)
pass('computes fixed discount')

const percent = computePromoDiscountPaise(
  {
    discount_type: 'percent',
    discount_paise: 0,
    discount_percent: 10,
    plan_discounts_paise: {},
    applicable_plans: ['6_months'],
  },
  '6_months',
  99900
)
assert.equal(percent, 9990)
pass('computes percent discount for allowed plan')

assert.equal(
  computePromoDiscountPaise(
    {
      discount_type: 'percent',
      discount_paise: 0,
      discount_percent: 10,
      plan_discounts_paise: {},
      applicable_plans: ['6_months'],
    },
    '3_months',
    149900
  ),
  null
)
pass('rejects plan outside allow-list')

assert.equal(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 2,
    expires_at: null,
  }),
  null
)
pass('active code with uses is valid')

assert.match(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 0,
    expires_at: null,
  }) ?? '',
  /no uses/i
)
pass('exhausted code is invalid')

const list3 = COACHING_PLANS['3_months'].amountPaise
const expected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: String(list3 - 20000),
  list_amount_paise: String(list3),
  discount_paise: '20000',
  discount_code: 'PARTNER50',
})
assert.equal(expected, list3 - 20000)
pass('order notes accept generic promo amounts')

const modules = readFileSync(resolve('src/lib/admin/modules.ts'), 'utf8')
assert.match(modules, /promo-codes/)
assert.match(modules, /Discount & Referral Codes/)
pass('admin nav registers promo codes module')

const migration = readFileSync(
  resolve('supabase/migrations/20260803100000_promo_codes.sql'),
  'utf8'
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promo_codes/)
assert.match(migration, /kind text NOT NULL CHECK \(kind IN \('discount', 'referral'\)\)/)
pass('migration creates promo_codes with discount/referral kinds')

assert.equal(isRetiredPublicDiscountCode('welcome60'), true)
assert.equal(isRetiredPublicDiscountCode('SUMMER60'), true)
assert.equal(isRetiredPublicDiscountCode('LUKE'), false)
assert.equal(isPublicSaleCode('summer60'), true)
assert.equal(publicSaleDiscountPaise(59900), null)
assert.equal(publicSaleDiscountPaise(99900), null)
assert.equal(publicSaleDiscountPaise(169900), null)
pass('WELCOME60 and SUMMER60 are retired; catalog prices are the public offer')

assert.equal(isAffiliateDiscountCode('luke'), true)
assert.equal(getAffiliateCode('LUKE')?.extraPercentOffSale, 5)
assert.equal(affiliateSalePaise('LUKE', '3_months'), 189900)
assert.equal(affiliateSalePaise('LUKE', '6_months'), 332400)
assert.equal(affiliateSalePaise('LUKE', '12_months'), 569900)
assert.equal(affiliateDiscountPaise('LUKE', '3_months', 199900), 10000)
assert.equal(affiliateDiscountPaise('LUKE', '6_months', 349900), 17500)
assert.equal(affiliateDiscountPaise('LUKE', '12_months', 599900), 30000)
pass('LUKE affiliate code is catalog price + 5% (₹1,899 / ₹3,324 / ₹5,699)')

const lukeExpected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '56900',
  list_amount_paise: '59900',
  discount_paise: '3000',
  discount_code: 'LUKE',
})
assert.equal(lukeExpected, 56900)
pass('order notes accept LUKE affiliate amounts')

const previewOne = DURATION_OFFER_PLANS.offer_1_month
const previewThree = DURATION_OFFER_PLANS.offer_3_months
assert.equal(isPreviewSaleCode('lurvox60'), true)
assert.equal(previewSaleDiscountPaise(previewOne.amountPaise), 14940)
assert.equal(previewOne.amountPaise - previewSaleDiscountPaise(previewOne.amountPaise), 9960)
assert.equal(previewThree.amountPaise - previewSaleDiscountPaise(previewThree.amountPaise), 19960)
const previewNotes = expectedAmountPaiseFromOrderNotes(previewOne, {
  amount_paise: '9960',
  list_amount_paise: String(previewOne.amountPaise),
  discount_paise: '14940',
  discount_code: 'LURVOX60',
})
assert.equal(previewNotes, 9960)
const previewFull = expectedAmountPaiseFromOrderNotes(previewOne, {
  amount_paise: String(previewOne.amountPaise),
  list_amount_paise: String(previewOne.amountPaise),
})
assert.equal(previewFull, previewOne.amountPaise)
pass('LURVOX60 is 60% off preview 1-month and 3-month prices only when the code is on the order')

const preview7Notes = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '89900',
  list_amount_paise: '89900',
})
assert.equal(preview7Notes, 89900)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
    amount_paise: '149900',
    list_amount_paise: '149900',
  }),
  149900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['12_months'], {
    amount_paise: '229900',
    list_amount_paise: '229900',
  }),
  229900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '90000',
    list_amount_paise: '90000',
  }),
  90000
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '199900',
    list_amount_paise: '199900',
  }),
  199900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
    amount_paise: '349900',
    list_amount_paise: '349900',
  }),
  349900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['12_months'], {
    amount_paise: '599900',
    list_amount_paise: '599900',
  }),
  599900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '59900',
    list_amount_paise: '59900',
  }),
  59900
)
pass('catalog verifies at ₹1,999 / ₹3,499 / ₹5,999; ₹899, ₹900 and ₹599 orders still verify')

assert.equal(preview7MarkedUpPaise(89900), 153000)
assert.equal(preview7MarkedUpPaise(149900), 255000)
assert.equal(preview7MarkedUpPaise(229900), 391000)
assert.equal(preview7MarkedUpPaise(90000), 153000)
assert.equal(preview7MarkedUpPaise(150000), 255000)
assert.equal(preview7MarkedUpPaise(230000), 391000)
assert.equal(preview7MarkedUpPaise(199900), 340000)
assert.equal(preview7MarkedUpPaise(349900), 595000)
assert.equal(preview7MarkedUpPaise(599900), 1020000)
const priced = preview7PricedPlan(COACHING_PLANS['3_months'], '/preview7')
assert.equal(priced.amountPaise, 199900)
assert.equal(priced.displayPrice, '₹1,999')
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '199900',
    list_amount_paise: '340000',
    discount_paise: '140100',
    discount_code: 'diwali7o',
  }),
  199900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
    amount_paise: '349900',
    list_amount_paise: '595000',
    discount_paise: '245100',
    discount_code: 'WINTER7O',
  }),
  349900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['12_months'], {
    amount_paise: '1020000',
    list_amount_paise: '1020000',
  }),
  1020000
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '100',
    list_amount_paise: '340000',
    discount_paise: '339900',
    discount_code: 'DIWALI7O',
  }),
  199900
)
const normal = preview7LiveHtml(`<head></head><body>
<aside id="lurvox-offer-strip-home" class="lurvox-offer-strip">WELCOME60 for 60% OFF ENDS SOON</aside>
<p>12 months. WELCOME60 = 60% off</p>
<div class="ai-transformation-plan-card-original-price-abc">₹2499</div>
<div class="ai-transformation-plan-card-price-abc">₹1299</div>
<div class="ai-transformation-plan-card-monthly-abc">≈ ₹433/month</div>
<div class="ai-transformation-plan-card-savings-abc">60% OFF · SAVE ₹1,200</div>
<div class="price">₹1999</div>
</body>`)
assert.equal(normal.includes('id="lx-p7-prices"'), false)
assert.equal(normal.includes('id="lurvox-offer-strip-home"'), true)
assert.match(normal, /India's best human fitness coaching/)
assert.match(normal, /id="lx-brand-strip"/)
assert.match(normal, /id="lx-home-coach-form"/)
assert.match(normal, /api\/public\/talk-to-a-coach/)
assert.doesNotMatch(normal, /WELCOME60 for 60% OFF ENDS SOON/)
assert.match(normal, /WELCOME60 = 60% off/)
assert.match(normal, /60% OFF · SAVE ₹1,200/)
assert.match(normal, /₹1299/)
assert.match(normal, /≈ ₹433\/month/)
assert.match(normal, /₹2499/)
assert.match(normal, />₹1999<\/div>/)
assert.equal(normal.includes('preview7-beige'), false)
assert.match(normal, /<base href="https:\/\/www\.lurvox\.in\/">/)
const tracked = injectPreview7Tracking(normal, {
  pixelId: '1195395326212201',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-test',
})
assert.match(tracked, /fbq\('init', "1195395326212201"\)/)
assert.match(tracked, /fbq\('track', 'PageView'\)/)
assert.match(tracked, /Lurvox_view_landing/)
assert.match(tracked, /lurvox-offer-strip-home/)
assert.match(tracked, /DOMContentLoaded/)
assert.match(tracked, /"id":"MainContent"/)
assert.match(tracked, /"id":"plans"/)
assert.match(tracked, /"id":"start"/)
assert.doesNotMatch(tracked, /lx-home-quiz/)
assert.equal(tracked.includes('location.replace'), false)
assert.equal(tracked.indexOf('id="preview7-tracking"') < tracked.indexOf('<base '), true)
pass('preview 7 mirrors the live storefront and keeps the app pixel')

const lukeMigration = readFileSync(
  resolve('supabase/migrations/20260809180000_luke_affiliate_promo.sql'),
  'utf8'
)
assert.match(lukeMigration, /'LUKE'/)
assert.match(lukeMigration, /referral/)
pass('migration seeds LUKE affiliate promo')

console.log('\nAll promo code checks passed.')
