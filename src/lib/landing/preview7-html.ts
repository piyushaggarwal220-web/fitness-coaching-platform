const SALE_STRIP = `<style id="lx-p7-no-sale">
  #lurvox-offer-strip-home,
  #lurvox-offer-strip-live,
  .lurvox-offer-strip { display: none !important; }
  [class*="plan-card-price-"],
  [class*="plan-card-savings-"],
  [class*="plan-card-monthly-"] { display: none !important; }
  [class*="plan-card-original-price"] {
    display: block !important;
    color: #ffffff !important;
    font-size: 28px !important;
    font-weight: 800 !important;
    text-decoration: none !important;
    opacity: 1 !important;
  }
</style>`

/** Live storefront without the sale bar, sale prices, or sale codes. */
export function preview7LiveHtml(html: string): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  next = next.replace(/<aside\b[^>]*\bid="lurvox-offer-strip-home"[\s\S]*?<\/aside>/gi, '')
  next = next.replace(/<div class="[^"]*plan-card-price-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  next = next.replace(/<div class="[^"]*plan-card-savings-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  next = next.replace(/<div class="[^"]*plan-card-monthly-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  next = next.replace(/ ?WELCOME60\s*=\s*60%\s*off/gi, '')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  if (next.includes('</body>')) return next.replace('</body>', `${SALE_STRIP}</body>`)
  return next + SALE_STRIP
}
