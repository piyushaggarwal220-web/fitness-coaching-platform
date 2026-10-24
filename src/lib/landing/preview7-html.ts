import { BRAND_TOP_BAR } from '@/lib/landing/brand-line'

/**
 * Keep /preview7 visually identical to the live storefront.
 * Only fix protocol-relative shop URLs, set a base href so Shopify assets load
 * from app.lurvox.in, and replace the retired discount strip with the brand line.
 */
export function preview7LiveHtml(html: string): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  return rewriteHomeOfferStrip(next)
}

function rewriteHomeOfferStrip(html: string): string {
  const hide =
    '<style id="lx-brand-strip">.lurvox-offer-strip__timer,.lurvox-offer-strip__emoji,.lurvox-offer-strip__clock{display:none!important}</style>'
  const withCss = html.includes('id="lx-brand-strip"') ? html : html.replace(/<\/head>/i, `${hide}</head>`)
  return withCss.replace(
    /<aside\b[^>]*id="lurvox-offer-strip-home"[^>]*>[\s\S]*?<\/aside>/i,
    (aside) => {
      let next = aside.replace(/aria-label="[^"]*"/i, `aria-label="${BRAND_TOP_BAR.replace(/"/g, '&quot;')}"`)
      if (/lurvox-offer-strip__copy/.test(next)) {
        next = next.replace(
          /<span class="lurvox-offer-strip__copy">[\s\S]*?<\/span>/,
          `<span class="lurvox-offer-strip__copy">${BRAND_TOP_BAR}</span>`
        )
      } else {
        next = next.replace(/>[\s\S]*?</, `>${BRAND_TOP_BAR}<`)
      }
      next = next.replace(
        /<span[^>]*lurvox-offer-strip__timer[\s\S]*?<strong>[^<]*<\/strong>\s*<\/span>/,
        ''
      )
      next = next.replace(/<span class="lurvox-offer-strip__emoji"[^>]*>[\s\S]*?<\/span>/, '')
      return next
    }
  )
}
