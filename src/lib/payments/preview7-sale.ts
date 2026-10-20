import { formatCountdownHms } from '@/lib/sale-countdown'
import { formatPreview7Inr, preview7MarkedUpPaise } from '@/lib/payments/preview7-prices'

/** Each sale stays up for 8 hours, then the other sale starts. They keep swapping. */
export const PREVIEW7_SALE_CYCLE_MS = 8 * 60 * 60 * 1000

/**
 * Shared clock. Slot 0 is Diwali, slot 1 is Winter.
 * 20 Oct 2026, 13:00 IST.
 */
export const PREVIEW7_SALE_EPOCH_MS = Date.UTC(2026, 9, 20, 7, 30, 0)

export const PREVIEW7_DIWALI_CODE = 'DIWALI7O'
export const PREVIEW7_WINTER_CODE = 'WINTER7O'

const DIWALI = { id: 'diwali', name: 'Diwali sale', code: PREVIEW7_DIWALI_CODE } as const
const WINTER = { id: 'winter', name: 'Winter sale', code: PREVIEW7_WINTER_CODE } as const

export type Preview7Sale = {
  id: 'diwali' | 'winter'
  name: 'Diwali sale' | 'Winter sale'
  code: typeof PREVIEW7_DIWALI_CODE | typeof PREVIEW7_WINTER_CODE
  remainingMs: number
}

export function normalizePreview7SaleCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

export function isPreview7SaleCode(raw: string | null | undefined): boolean {
  const code = normalizePreview7SaleCode(raw)
  return code === PREVIEW7_DIWALI_CODE || code === PREVIEW7_WINTER_CODE
}

export function canonicalPreview7SaleCode(
  raw: string,
): typeof PREVIEW7_DIWALI_CODE | typeof PREVIEW7_WINTER_CODE {
  return normalizePreview7SaleCode(raw) === PREVIEW7_WINTER_CODE
    ? PREVIEW7_WINTER_CODE
    : PREVIEW7_DIWALI_CODE
}

/** Which sale is on, and how many ms are left in its 8-hour window. */
export function preview7SaleAt(now = Date.now()): Preview7Sale {
  const cycle = PREVIEW7_SALE_CYCLE_MS
  let elapsed = now - PREVIEW7_SALE_EPOCH_MS
  if (elapsed < 0) {
    elapsed += Math.ceil(-elapsed / cycle) * cycle
  }
  const slot = Math.floor(elapsed / cycle)
  const into = elapsed - slot * cycle
  const sale = slot % 2 === 1 ? WINTER : DIWALI
  return { ...sale, remainingMs: cycle - into }
}

const PLAN_ROWS = [
  { payPaise: 199900, card: '₹1999', quoted: '₹1,999', monthly: '₹666', savings: null },
  { payPaise: 349900, card: '₹3499', quoted: '₹3,499', monthly: '₹583', savings: '₹1,495' },
  { payPaise: 599900, card: '₹5999', quoted: '₹5,999', monthly: '₹500', savings: '₹3,989' },
] as const

function rupeeLabel(rupees: number): string {
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`
}

function markedMonthly(monthly: string): string {
  const rupees = Number(monthly.replace(/[^\d]/g, ''))
  return rupeeLabel(Math.round(rupees * 1.7))
}

function markedSavings(savings: string): string {
  const rupees = Number(savings.replace(/[^\d]/g, ''))
  return rupeeLabel(Math.round(rupees * 1.7))
}

/** Raise every preview7 sticker price by 70%. The code price stays in a second line on the plan cards. */
export function raisePreview7Prices(html: string): string {
  let next = html
  for (const row of PLAN_ROWS) {
    next = next.split(row.quoted).join(`__P7Q_${row.payPaise}__`)
  }
  for (const row of PLAN_ROWS) {
    const list = formatPreview7Inr(preview7MarkedUpPaise(row.payPaise))
    const pay = formatPreview7Inr(row.payPaise)
    next = next.split(`>${row.card}</div>`).join(
      `><span class="lx-p7-list">${list}</span><span class="lx-p7-pay">${pay} with code</span></div>`,
    )
    next = next.split(`__P7Q_${row.payPaise}__`).join(list)
    next = next.split(`≈ ${row.monthly}/month`).join(`≈ ${markedMonthly(row.monthly)}/month`)
    if (row.savings) {
      next = next.split(`Save ${row.savings} vs monthly rate`).join(`Save ${markedSavings(row.savings)} vs monthly rate`)
    }
  }
  return next
}

function saleBanner(sale: Preview7Sale): string {
  const timer = formatCountdownHms(sale.remainingMs)
  return `<div id="lx-p7-sale" class="lx-p7-sale" role="status" aria-live="polite">
  <p class="lx-p7-sale__line"><span data-lx-p7-name>${sale.name}</span> ends in</p>
  <p class="lx-p7-sale__timer" data-lx-p7-timer>${timer}</p>
  <p class="lx-p7-sale__code">Code <strong data-lx-p7-code>${sale.code}</strong> for extra 70% off</p>
</div>`
}

function insertSaleBanner(html: string, banner: string): string {
  const gallery = html.match(/<fitness-gallery-[a-z0-9]+\b/i)
  if (gallery && gallery.index != null) {
    return html.slice(0, gallery.index) + banner + html.slice(gallery.index)
  }
  const headline = html.indexOf('Personal workout + diet')
  if (headline > 0) {
    const start = html.lastIndexOf('<div', headline)
    if (start >= 0) return html.slice(0, start) + banner + html.slice(start)
  }
  return banner + html
}

function rewritePlanLinks(html: string, origin: string, code: string): string {
  const root = origin.replace(/\/$/, '')
  return html.replace(
    /https:\/\/app\.lurvox\.in\/plans\/(3-months|6-months|12-months)\?landing=\/preview7/g,
    (_full, path: string) => `${root}/plans/${path}?landing=/preview7&code=${code}`,
  )
}

function rewriteQuizAssign(html: string): string {
  const from =
    "root.querySelector('[data-lxq-checkout]').href = 'https://app.lurvox.in/plans/' + plan.path + '?landing=/preview7';"
  const to =
    "root.querySelector('[data-lxq-checkout]').href = window.lxP7PlanHref(plan.path);"
  return html.split(from).join(to)
}

const SALE_STYLE = `<style id="lx-p7-sale-css">
  .lx-p7-sale {
    margin: 0 0 12px;
    padding: 12px 16px 14px;
    background:
      radial-gradient(circle at 18% -80%, rgba(255, 98, 0, 0.42), transparent 52%),
      linear-gradient(105deg, #100b08 0%, #17100c 48%, #090909 100%) !important;
    color: #ffffff !important;
    border-bottom: 1px solid rgba(255, 98, 0, 0.38);
    text-align: center;
  }
  .lx-p7-sale, .lx-p7-sale * { color: #ffffff !important; }
  .lx-p7-sale__line, .lx-p7-sale__timer, .lx-p7-sale__code { margin: 0; }
  .lx-p7-sale__line {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .lx-p7-sale__timer, .lx-p7-sale__code strong { color: #ff6200 !important; }
  .lx-p7-sale__timer {
    margin-top: 4px;
    font-size: 34px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }
  .lx-p7-sale__code {
    margin-top: 8px;
    font-size: 14px;
    font-weight: 650;
  }
  [class*="plan-card-price"] {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
  }
  .lx-p7-list { line-height: 1.1; }
  .lx-p7-pay {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: 0;
    color: #ff6200 !important;
  }
</style>`

function saleScript(origin: string): string {
  const root = origin.replace(/\/$/, '')
  return `<script id="lx-p7-sale-script">
(function () {
  var EPOCH = ${PREVIEW7_SALE_EPOCH_MS};
  var CYCLE = ${PREVIEW7_SALE_CYCLE_MS};
  var SALES = ${JSON.stringify([DIWALI, WINTER])};
  var ORIGIN = ${JSON.stringify(root)};
  var code = SALES[0].code;
  function saleAt(now) {
    var elapsed = now - EPOCH;
    if (elapsed < 0) elapsed += Math.ceil(-elapsed / CYCLE) * CYCLE;
    var slot = Math.floor(elapsed / CYCLE);
    var into = elapsed - slot * CYCLE;
    return { sale: SALES[slot % 2], remaining: CYCLE - into };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function label(ms) {
    var safe = Math.max(0, ms);
    var total = Math.floor(safe / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function rewrite(href) {
    try {
      var url = new URL(href, ORIGIN);
      if (url.searchParams.get('landing') !== '/preview7') return href;
      if (!/\\/plans\\/(3-months|6-months|12-months)$/.test(url.pathname)) return href;
      url.searchParams.set('code', code);
      return ORIGIN + url.pathname + url.search;
    } catch (e) {
      return href;
    }
  }
  window.lxP7PlanHref = function (path) {
    return ORIGIN + '/plans/' + path + '?landing=/preview7&code=' + code;
  };
  function paint() {
    var state = saleAt(Date.now());
    code = state.sale.code;
    document.querySelectorAll('[data-lx-p7-name]').forEach(function (el) { el.textContent = state.sale.name; });
    document.querySelectorAll('[data-lx-p7-timer]').forEach(function (el) { el.textContent = label(state.remaining); });
    document.querySelectorAll('[data-lx-p7-code]').forEach(function (el) { el.textContent = state.sale.code; });
    document.querySelectorAll('[data-plan-link]').forEach(function (el) {
      var href = el.getAttribute('data-plan-link') || '';
      if (href.indexOf('/plans/') === -1) return;
      el.setAttribute('data-plan-link', rewrite(href));
    });
    document.querySelectorAll('a[href*="/plans/"]').forEach(function (el) {
      var href = el.getAttribute('href') || '';
      if (href.indexOf('landing=') === -1) return;
      el.setAttribute('href', rewrite(href));
    });
  }
  paint();
  setInterval(paint, 1000);
})();
</script>`
}

/**
 * Normal storefront, plus the sale. Does not apply the beige skin.
 * Asset links stay on lurvox.in. Plan links stay on this origin.
 */
export function preview7StorefrontHtml(html: string, origin: string, now = Date.now()): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  return applyPreview7Sale(next, origin, now)
}

/** Localhost preview7 hero sale, sticker prices, and checkout links. */
export function applyPreview7Sale(html: string, origin: string, now = Date.now()): string {
  const sale = preview7SaleAt(now)
  let next = raisePreview7Prices(html)
  next = rewritePlanLinks(next, origin, sale.code)
  next = rewriteQuizAssign(next)
  next = insertSaleBanner(next, saleBanner(sale))
  const boot = `${SALE_STYLE}${saleScript(origin)}`
  if (next.includes('</body>')) return next.replace('</body>', `${boot}</body>`)
  return next + boot
}
