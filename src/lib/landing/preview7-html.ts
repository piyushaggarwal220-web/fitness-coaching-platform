const PRICE_STYLE = `<style id="lx-p7-prices">
  #lurvox-offer-strip-home,
  #lurvox-offer-strip-live,
  .lurvox-offer-strip { display: none !important; }
  [class*="ai-transformation-plan-cards-"] {
    gap: 14px !important;
    margin: 22px 0 36px !important;
  }
  [class*="ai-transformation-plan-card-"][data-plan-index] {
    opacity: 1 !important;
    transform: none !important;
    background: #100e0c !important;
    border: 1px solid rgba(255,255,255,0.14) !important;
    box-shadow: none !important;
    border-radius: 18px !important;
    padding: 16px !important;
  }
  [class*="ai-transformation-plan-card-"][data-plan-index="3"] {
    background: #1b110c !important;
    border: 2px solid #ff6200 !important;
    box-shadow: 0 18px 40px rgba(255, 98, 0, 0.28) !important;
    padding: 20px 16px 18px !important;
  }
  [class*="plan-card-inner-"] {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
  }
  [class*="plan-card-right-"] {
    order: -1 !important;
    align-items: flex-start !important;
  }
  [class*="plan-card-pricing-"] {
    align-items: flex-start !important;
  }
  [class*="plan-card-price-"] {
    display: block !important;
    color: #ff6200 !important;
    font-size: 44px !important;
    font-weight: 800 !important;
    line-height: 0.9 !important;
    letter-spacing: -0.04em !important;
    text-shadow: none !important;
  }
  [data-plan-index="3"] [class*="plan-card-price-"] {
    font-size: 58px !important;
  }
  [class*="plan-card-monthly-"] {
    display: block !important;
    margin-top: 8px !important;
    color: #ffffff !important;
    font-size: 16px !important;
    font-weight: 750 !important;
  }
  [class*="plan-card-original-price"] {
    display: block !important;
    color: rgba(255,255,255,0.45) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
    text-decoration: line-through !important;
    opacity: 1 !important;
  }
  [class*="plan-card-description-"] { display: none !important; }
  [data-plan-index="3"] [class*="plan-badge-"] {
    font-size: 12px !important;
    padding: 6px 12px !important;
  }
</style>`

/** Live storefront without the sale bar, sale prices, or sale codes. */
export function preview7LiveHtml(html: string): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  next = next.replace(/<aside\b[^>]*\bid="lurvox-offer-strip-home"[\s\S]*?<\/aside>/gi, '')
  next = next.replace(/<div class="[^"]*plan-card-savings-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  next = next.replace(/ ?WELCOME60\s*=\s*60%\s*off/gi, '')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  if (next.includes('</body>')) return next.replace('</body>', `${PRICE_STYLE}</body>`)
  return next + PRICE_STYLE
}
