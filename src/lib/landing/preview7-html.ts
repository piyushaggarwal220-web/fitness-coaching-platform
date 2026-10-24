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
  return injectHomeCoachForm(rewriteHomeOfferStrip(next))
}

const HOME_COACH_FORM_SCRIPT = `<script id="lx-home-coach-form">
(function(){if(window.__lurvoxHomeCoachForm)return;window.__lurvoxHomeCoachForm=true;var A="https://app.lurvox.in/api/public/talk-to-a-coach";var M="Homepage request: please call me about LURVOX coaching.";function field(f,k){for(var i=0;i<k.length;i++){var e=f.querySelector('[name="'+k[i]+'"]');if(e&&String(e.value||"").trim())return String(e.value).trim()}return""}function bind(f){if(f.dataset.lxCoachBound==="1")return;f.dataset.lxCoachBound="1";f.addEventListener("submit",function(ev){ev.preventDefault();ev.stopPropagation();var name=field(f,["contact[name]","name"]);var email=field(f,["contact[email]","email"]);var phone=field(f,["contact[phone]","phone"]);var st=f.querySelector("[data-lx-coach-status]");if(!st){st=document.createElement("p");st.setAttribute("data-lx-coach-status","1");st.setAttribute("role","status");f.appendChild(st)}var btn=f.querySelector('button[type="submit"],input[type="submit"],button:not([type])');if(!name||name.length<2){st.textContent="Please enter your name.";return}if(!phone||phone.replace(/\\D/g,"").length<10){st.textContent="Please enter a valid WhatsApp number.";return}st.textContent="Sending…";if(btn)btn.disabled=true;fetch(A,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,email:email,phone:phone,message:M})}).then(function(r){return r.json().catch(function(){return null}).then(function(d){return{ok:r.ok&&d&&d.ok,error:d&&d.error}})}).then(function(res){if(!res.ok){st.textContent=res.error||"Could not send. Please try again.";if(btn)btn.disabled=false;return}st.textContent="Got it. A coach will call you."}).catch(function(){st.textContent="Network error. Please try again.";if(btn)btn.disabled=false})},true)}function scan(){document.querySelectorAll('form[action*="/contact"]').forEach(bind)}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();setTimeout(scan,800)})();
</script>`

function injectHomeCoachForm(html: string): string {
  if (html.includes('id="lx-home-coach-form"')) return html
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${HOME_COACH_FORM_SCRIPT}</body>`)
  return html + HOME_COACH_FORM_SCRIPT
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
