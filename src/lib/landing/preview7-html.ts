import { BRAND_TOP_BAR } from '@/lib/landing/brand-line'

/**
 * Keep /preview7 visually the live storefront, then fix the dead homepage
 * call path: Shopify /contact never produced a lead. Replace it with the
 * same consult fields as /pages/talk-to-a-coach, and put Talk in the hero
 * and mobile header so catalog visitors can book without leaving preview7.
 */
export function preview7LiveHtml(html: string): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  return injectHomeCoachForm(
    injectCoachInstaCta(
      revampWhatYouGet(movePlansBeforeWhatYouGet(rewriteHeroStartCopy(rewriteHomeOfferStrip(next)))),
    ),
  )
}

const WYG_SECTION = `<section class="lx-wyg lx-wyg--cards" id="what-you-get" aria-label="What you get on LURVOX">
  <div class="lx-wyg__inner">
    <header class="lx-wyg__header">
      <p class="lx-wyg__eyebrow">Included on every plan</p>
      <h2 class="lx-wyg__title">What you get on the platform</h2>
      <p class="lx-wyg__lede">A living coaching system. Not a PDF.</p>
    </header>
    <ul class="lx-wyg__grid">
      <li class="lx-wyg__item"><span class="lx-wyg__mark">01</span><div><h3>Personal workout + diet</h3><p>Built for your body and food. In the app within 24–48 hours.</p></div></li>
      <li class="lx-wyg__item"><span class="lx-wyg__mark">02</span><div><h3>Human coach in the app</h3><p>A real person owns your case. Chat them directly.</p></div></li>
      <li class="lx-wyg__item"><span class="lx-wyg__mark">03</span><div><h3>Mid-week + weekly check-ins</h3><p>Photos and numbers reviewed. The plan moves with you.</p></div></li>
      <li class="lx-wyg__item"><span class="lx-wyg__mark">04</span><div><h3>Daily trackers</h3><p>Workout, meals, water, sleep, steps. Your coach sees them.</p></div></li>
      <li class="lx-wyg__item"><span class="lx-wyg__mark">05</span><div><h3>Journey + progress photos</h3><p>A timeline of proof. Not guessing.</p></div></li>
      <li class="lx-wyg__item"><span class="lx-wyg__mark">06</span><div><h3>Plan tweaks when you stall</h3><p>Coach adjusts workouts and diet. Not a static PDF.</p></div></li>
    </ul>
  </div>
</section>`

function revampWhatYouGet(html: string): string {
  const start = html.search(/<section\b[^>]*\bid="what-you-get"/)
  if (start < 0) return html
  const end = html.indexOf('</section>', start)
  if (end < 0) return html
  return html.slice(0, start) + WYG_SECTION + html.slice(end + '</section>'.length)
}

const HERO_START_FROM = 'Start in 90 days'
const HERO_START_TO = 'Start the journey within 24 hours'

function rewriteHeroStartCopy(html: string): string {
  return html.replaceAll(`${HERO_START_FROM}.`, `${HERO_START_TO}.`).replaceAll(HERO_START_FROM, HERO_START_TO)
}

/**
 * Catalog visitors hit “See plans” in the hero, then have to scroll past
 * the feature list. Only ~1 in 5 reached #plans. Put the goal/price cards
 * first; “What you get” explains the price after they see it.
 */
export function movePlansBeforeWhatYouGet(html: string): string {
  const wygOpen = html.search(/<div>\s*<section\b[^>]*\blx-wyg\b/)
  const plansOpen = html.search(/<div>\s*<div id="plans"/)
  if (wygOpen < 0 || plansOpen < 0 || plansOpen < wygOpen) return html

  const wygEnd = endOfDiv(html, wygOpen)
  const spacerEnd = endOfDiv(html, plansOpen)
  if (wygEnd < 0 || spacerEnd < 0) return html

  let plansEnd = spacerEnd
  const nextDiv = findDivOpen(html, spacerEnd)
  if (nextDiv >= 0 && nextDiv - spacerEnd < 16) {
    const blockEnd = endOfDiv(html, nextDiv)
    const block = blockEnd > nextDiv ? html.slice(nextDiv, blockEnd) : ''
    if (blockEnd > nextDiv && /Pick your goal|CHOOSE YOUR GOAL|ai-transformation-plan/i.test(block)) {
      plansEnd = blockEnd
    }
  }

  const plans = html.slice(plansOpen, plansEnd)
  const wyg = html.slice(wygOpen, wygEnd)
  return html.slice(0, wygOpen) + plans + wyg + html.slice(wygEnd, plansOpen) + html.slice(plansEnd)
}

function findDivOpen(html: string, from: number): number {
  const match = html.slice(from).match(/<div(?=[\s>])/)
  return match && match.index != null ? from + match.index : -1
}

function endOfDiv(html: string, openIndex: number): number {
  if (!/^<div(?=[\s>])/i.test(html.slice(openIndex))) return -1
  let i = openIndex
  let depth = 0
  while (i < html.length) {
    const rest = html.slice(i)
    const nextOpenRel = rest.search(/<div(?=[\s>])/i)
    const nextCloseRel = rest.indexOf('</div>')
    if (nextCloseRel < 0) return -1
    const nextOpen = nextOpenRel >= 0 ? i + nextOpenRel : -1
    const nextClose = i + nextCloseRel
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1
      i = nextOpen + 4
    } else {
      depth -= 1
      i = nextClose + 6
      if (depth === 0) return i
    }
  }
  return -1
}

const CONSULT_FORM = `<section id="lx-home-consult" class="lx-p7-consult">
  <div class="lx-p7-consult__booked" data-lx-consult-booked hidden>
    <p class="lx-p7-consult__kicker">Confirmed</p>
    <h2>Call booked</h2>
    <p>We have your request. A coach will call you.</p>
  </div>
  <form class="lx-p7-consult__form" data-lx-consult-form novalidate>
    <p class="lx-p7-consult__kicker">Free coach call</p>
    <h2>Talk to a coach</h2>
    <p class="lx-p7-consult__lede">Name and WhatsApp. Takes 20 seconds. A coach calls you.</p>
    <label>Name
      <input name="name" type="text" required autocomplete="name" placeholder="Your full name">
    </label>
    <label>Phone / WhatsApp
      <input name="phone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210">
    </label>
    <p class="lx-p7-consult__status" data-lx-consult-status role="status" aria-live="polite"></p>
    <button type="submit" data-lx-consult-submit>Request a free call</button>
    <p class="lx-p7-consult__fine">Free consultation · No payment · A coach typically responds within a few hours</p>
  </form>
</section>`

const COACH_INSTA_CTA = `<section id="lx-coach-insta" class="lx-ig-cta" aria-label="Tap to open coach Instagram">
  <div class="lx-ig-cta__card">
    <p class="lx-ig-cta__kicker"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor"/></svg> Instagram</p>
    <h2 class="lx-ig-cta__title">Tap to open coach Instagram</h2>
    <p class="lx-ig-cta__lede">See the coaches. Real profiles.</p>
    <div class="lx-ig-cta__row">
      <a class="lx-ig-cta__chip" href="https://www.instagram.com/maximusvault/" target="_blank" rel="noopener noreferrer" data-funnel="coach_instagram">
        <span class="lx-ig-cta__ring"><img src="https://app.lurvox.in/landing/instant-coach-piyush.png" alt="Piyush Aggarwal, LURVOX coach" width="80" height="80"></span>
        <strong>Piyush</strong>
        <span>@maximusvault</span>
      </a>
      <a class="lx-ig-cta__chip" href="https://www.instagram.com/rakshitmohla_/" target="_blank" rel="noopener noreferrer" data-funnel="coach_instagram">
        <span class="lx-ig-cta__ring"><img src="https://app.lurvox.in/landing/instant-coach-rakshit.png" alt="Rakshit Mohla, LURVOX coach" width="80" height="80"></span>
        <strong>Rakshit</strong>
        <span>@rakshitmohla_</span>
      </a>
    </div>
  </div>
</section>`

const COACH_INSTA_STYLE = `#lx-coach-insta.lx-ig-cta{margin:4px auto 0;max-width:560px;padding:0 16px 10px;color:#fff}
.lx-ig-cta__card{border-radius:22px;padding:18px 14px 14px;text-align:center;background:linear-gradient(160deg,#ff9ad5 0%,#ff4d8d 26%,#ee2a7b 52%,#c13584 78%,#833ab4 100%);box-shadow:0 16px 40px rgba(238,42,123,.32),inset 0 1px 0 rgba(255,255,255,.28)}
.lx-ig-cta__kicker{margin:0 0 6px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.lx-ig-cta__title{margin:0 0 4px;font-size:clamp(1.25rem,5vw,1.55rem);letter-spacing:-.03em;line-height:1.15}
.lx-ig-cta__lede{margin:0 0 14px;font-size:13px;color:rgba(255,255,255,.88)}
.lx-ig-cta__row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lx-ig-cta__chip{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px 10px;border-radius:16px;text-decoration:none!important;color:#fff!important;background:rgba(20,0,16,.22);border:1px solid rgba(255,255,255,.22)}
.lx-ig-cta__ring{width:64px;height:64px;padding:3px;border-radius:50%;background:linear-gradient(135deg,#f9ce34,#ee2a7b 50%,#6228d7);box-sizing:border-box}
.lx-ig-cta__ring img{width:100%;height:100%;object-fit:cover;border-radius:50%;border:2px solid #1a0b14;display:block}
.lx-ig-cta__chip strong{font-size:14px;line-height:1.2}
.lx-ig-cta__chip span{font-size:12px;opacity:.92}`

function hasVisibleCoachInsta(html: string): boolean {
  const withoutTemplates = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
  return /<section\b[^>]*\bid="lx-coach-insta"/.test(withoutTemplates)
}

function injectCoachInstaCta(html: string): string {
  if (hasVisibleCoachInsta(html)) return html
  const afterPlans = html.replace(
    /(<div id="plans"[^>]*>\s*<\/div>\s*<\/div>)/,
    `$1${COACH_INSTA_CTA}`,
  )
  if (afterPlans !== html) return afterPlans
  return html.replace(
    /(<div[^>]*class="[^"]*shopify-block[^"]*"[^>]*>[\s\S]{0,1200}(?:CHOOSE YOUR GOAL|Pick your goal))/i,
    `${COACH_INSTA_CTA}$1`,
  )
}

const CONSULT_STYLE = `<style id="lx-home-consult-css">
.lx-p7-consult{scroll-margin-top:88px;margin:0 auto;max-width:560px;padding:28px 16px 40px;color:#f5f5f5}
.lx-p7-consult__form,.lx-p7-consult__booked{background:#141414;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:20px 16px 18px}
.lx-p7-consult__kicker{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff6200;font-weight:750}
.lx-p7-consult h2{margin:0 0 8px;font-size:26px;letter-spacing:-.03em}
.lx-p7-consult__lede,.lx-p7-consult__hint,.lx-p7-consult__fine{margin:0 0 14px;color:rgba(245,245,245,.68);font-size:14px;line-height:1.45}
.lx-p7-consult__hint{margin:0 0 8px;font-size:12px}
.lx-p7-consult label{display:grid;gap:6px;margin:0 0 12px;font-size:13px;font-weight:650}
.lx-p7-consult input[type=text],.lx-p7-consult input[type=tel],.lx-p7-consult input[type=email],.lx-p7-consult textarea{
  width:100%;box-sizing:border-box;min-height:48px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.16);
  background:#1a1a1a;color:#fff;font:inherit
}
.lx-p7-consult textarea{min-height:88px;resize:vertical}
.lx-p7-consult__row{display:grid;gap:10px}
@media(min-width:560px){.lx-p7-consult__row{grid-template-columns:1fr 1fr}}
.lx-p7-consult fieldset{border:0;margin:0 0 14px;padding:0}
.lx-p7-consult legend{margin:0 0 8px;font-size:13px;font-weight:750}
.lx-p7-consult__opts,.lx-p7-consult__goals{display:grid;gap:8px}
.lx-p7-consult__opts{grid-template-columns:1fr 1fr}
.lx-p7-consult__opts--times{grid-template-columns:1fr 1fr; }
@media(min-width:560px){.lx-p7-consult__opts--times{grid-template-columns:repeat(3,1fr)}}
.lx-p7-consult__opts label,.lx-p7-consult__goals label{
  margin:0;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#1a1a1a;
  display:flex;flex-direction:column;gap:2px;cursor:pointer;font-weight:700
}
.lx-p7-consult__opts label:has(input:checked),.lx-p7-consult__goals label:has(input:checked){
  border-color:#ff6200;background:rgba(255,98,0,.16)
}
.lx-p7-consult__opts small,.lx-p7-consult__goals small{font-weight:600;opacity:.6;font-size:11px}
.lx-p7-consult button[type=submit]{
  width:100%;min-height:52px;border:0;border-radius:999px;background:#ff6200;color:#140900;font-weight:800;font-size:16px;cursor:pointer
}
.lx-p7-consult button[type=submit]:disabled{opacity:.65;cursor:wait}
.lx-p7-consult__status{min-height:1.2em;margin:0 0 10px;font-size:13px}
.lx-p7-consult__status.is-error{color:#ff8a80}
.lx-p7-consult__status.is-success{color:#9be7a6}
.lx-p7-consult__fine{margin:10px 0 0;text-align:center;font-size:12px}
[data-lx-hero-cta]{
  display:flex!important;flex-direction:column!important;align-items:stretch!important;
  gap:10px!important;padding:12px 12px 8px!important
}
[data-lx-hero-cta] > a[class*="cta-primary"]{
  width:100%!important;min-height:58px!important;border-radius:999px!important;
  display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important
}
[data-lx-hero-cta] .lx-hero-cta-text,
[data-lx-hero-cta] a[href="#plans"]{display:none!important}
.lx-p7-talk-hero{
  display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;
  width:100%;box-sizing:border-box;padding:12px 16px;min-height:58px;
  border-radius:999px;border:1.5px solid #ff6200;background:#111;
  color:#fff!important;text-align:center;text-decoration:none!important;font-weight:800;line-height:1.2;font-size:16px
}
.lx-p7-talk-hero small{display:block;font-weight:650;color:#ffb089;font-size:12px;letter-spacing:.02em}
.lx-p7-talk-block{margin:18px auto 0;max-width:420px}
#what-you-get.lx-wyg{padding:36px 16px 48px!important;background:#070707!important;overflow:visible!important}
#what-you-get .lx-wyg__glow{display:none!important}
#what-you-get .lx-wyg__inner{max-width:720px!important}
#what-you-get .lx-wyg__header{text-align:left!important;max-width:none!important;margin:0 0 20px!important}
#what-you-get .lx-wyg__eyebrow{margin:0 0 8px!important;letter-spacing:.14em!important}
#what-you-get .lx-wyg__title{margin:0 0 8px!important;font-size:clamp(1.55rem,6vw,2rem)!important;line-height:1.15!important}
#what-you-get .lx-wyg__lede{font-size:1rem!important;color:rgba(245,245,245,.72)!important}
#what-you-get .lx-wyg__grid{
  display:grid!important;grid-template-columns:1fr!important;gap:10px!important;border:0!important
}
@media(min-width:640px){#what-you-get .lx-wyg__grid{grid-template-columns:1fr 1fr!important}}
#what-you-get .lx-wyg__item,
#what-you-get .lx-wyg__item:nth-child(odd),
#what-you-get .lx-wyg__item:nth-child(even){
  display:flex!important;flex-direction:column!important;gap:8px!important;align-items:stretch!important;
  padding:16px 16px 18px!important;margin:0!important;
  border:1px solid rgba(255,255,255,.1)!important;border-radius:16px!important;background:#141414!important;
  grid-template-columns:none!important
}
#what-you-get .lx-wyg__mark{
  width:auto!important;height:auto!important;margin:0!important;border-radius:0!important;
  background:none!important;box-shadow:none!important;
  font-size:11px!important;font-weight:800!important;letter-spacing:.14em;color:#ff6200
}
#what-you-get .lx-wyg__item h3{margin:0 0 4px!important;font-size:1.05rem!important;line-height:1.25!important}
#what-you-get .lx-wyg__item p{margin:0!important;font-size:.92rem!important;line-height:1.45!important;color:rgba(245,245,245,.68)!important}
a.header-actions__action[href*="talk-to-a-coach"],
a.header-actions__action[href="#lx-home-consult"]{
  display:inline-flex!important;align-items:center!important;justify-content:center!important;
  gap:6px!important;height:36px!important;min-height:36px!important;min-width:0!important;
  padding:0 12px 0 10px!important;margin:0!important;
  border-radius:999px!important;border:1px solid rgba(255,98,0,.55)!important;
  background:#141414!important;color:#fff!important;box-shadow:none!important;
  text-decoration:none!important
}
a.header-actions__action[href*="talk-to-a-coach"] .svg-wrapper,
a.header-actions__action[href="#lx-home-consult"] .svg-wrapper,
a.header-actions__action[href*="talk-to-a-coach"] svg,
a.header-actions__action[href="#lx-home-consult"] svg{
  width:16px!important;height:16px!important;color:#ff6200!important
}
#Details-menu-drawer-container > summary.header__icon--menu,
header-drawer summary.header__icon.header__icon--menu {
  display:flex!important;align-items:center!important;justify-content:center!important;
  visibility:visible!important;opacity:1!important;color:#fff!important;
  width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;
  padding:8px!important;pointer-events:auto!important
}
#Details-menu-drawer-container > summary.header__icon--menu .header-drawer-icon,
#Details-menu-drawer-container > summary.header__icon--menu .svg-wrapper,
#Details-menu-drawer-container > summary.header__icon--menu svg,
header-drawer summary.header__icon--menu .header-drawer-icon,
header-drawer summary.header__icon--menu svg {
  display:block!important;visibility:visible!important;opacity:1!important;
  color:#fff!important;width:22px!important;height:22px!important
}
#Details-menu-drawer-container > summary.header__icon--menu path,
header-drawer summary.header__icon--menu path {
  stroke:#fff!important;stroke-width:1.75!important
}
a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label,
a.header-actions__action[href="#lx-home-consult"] .lurvox-talk-cta__label{
  display:inline!important;font-size:12px!important;font-weight:750!important;
  letter-spacing:-.01em;white-space:nowrap;color:#fff!important;line-height:1
}
${COACH_INSTA_STYLE}
</style>`

const CONSULT_SCRIPT = `<script id="lx-home-coach-form">
(function(){
  if(window.__lurvoxHomeCoachForm)return;
  window.__lurvoxHomeCoachForm=true;
  var A=location.origin+"/api/public/talk-to-a-coach";
  var KEY="lurvox_consult_booked";

  function $(sel,root){return (root||document).querySelector(sel)}
  function showBooked(root){
    var form=$("[data-lx-consult-form]",root);
    var done=$("[data-lx-consult-booked]",root);
    if(form)form.hidden=true;
    if(done)done.hidden=false;
  }
  function setStatus(el,msg,type){
    if(!el)return;
    el.textContent=msg||"";
    el.className="lx-p7-consult__status"+(type?" is-"+type:"");
  }
  function bindForm(form){
    if(!form||form.dataset.lxCoachBound==="1")return;
    form.dataset.lxCoachBound="1";
    var root=form.closest(".lx-p7-consult")||document;
    var status=$("[data-lx-consult-status]",root);
    var btn=$("[data-lx-consult-submit]",root);
    try{if(localStorage.getItem(KEY)==="1")showBooked(root)}catch(e){}
    form.addEventListener("submit",function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      var name=(form.name&&form.name.value||"").trim();
      var phone=(form.phone&&form.phone.value||"").trim();
      if(name.length<2){setStatus(status,"Please enter your name.","error");return}
      if(phone.replace(/\\D/g,"").length<10){setStatus(status,"Please enter a valid WhatsApp number.","error");return}
      setStatus(status,"Sending…","");
      if(btn)btn.disabled=true;
      fetch(A,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name:name,phone:phone,message:"Please call me about LURVOX coaching."
      })}).then(function(r){
        return r.json().catch(function(){return null}).then(function(d){return{ok:r.ok&&d&&d.ok,error:d&&d.error}})
      }).then(function(res){
        if(!res.ok){
          setStatus(status,res.error||"Could not send. Please try again.","error");
          if(btn)btn.disabled=false;
          return;
        }
        setStatus(status,"Call booked. A coach will call you.","success");
        try{localStorage.setItem(KEY,"1")}catch(e){}
        showBooked(root);
      }).catch(function(){
        setStatus(status,"Network error. Please try again.","error");
        if(btn)btn.disabled=false;
      });
    },true);
  }

  function addTalkHeaderCta(){
    var host=document.querySelector('[class*="ai-contact-header-content"]');
    if(!host){
      var nodes=document.querySelectorAll("h2");
      for(var i=0;i<nodes.length;i++){
        var t=(nodes[i].textContent||"").replace(/\\s+/g," ").trim();
        if(t.indexOf("Not sure yet? Talk to a coach")===0){
          host=nodes[i].parentElement;
          break;
        }
      }
    }
    if(!host||host.querySelector(".lx-p7-talk-block"))return;
    var a=document.createElement("a");
    a.className="lx-p7-talk-hero lx-p7-talk-block";
    a.href="#lx-home-consult";
    a.setAttribute("data-funnel","talk_to_coach");
    a.innerHTML="Book a free call <small>Name + WhatsApp · 20 seconds</small>";
    host.appendChild(a);
    var consult=document.getElementById("lx-home-consult");
    var block=host.closest(".shopify-block")||host.closest('[class*="ai-contact-header"]');
    if(consult&&block&&block.parentNode){
      block.parentNode.insertBefore(consult,block.nextSibling);
    }
  }

  function addHeroTalk(){
    var wrap=document.querySelector("[data-lx-hero-cta]");
    if(!wrap)return;
    wrap.removeAttribute("data-lx-hero-cta-single");
    wrap.querySelectorAll('a[href="#plans"],a.lx-hero-cta-text').forEach(function(a){a.remove()});
    if(wrap.querySelector(".lx-p7-talk-hero"))return;
    var a=document.createElement("a");
    a.className="lx-p7-talk-hero";
    a.href="#lx-home-consult";
    a.setAttribute("data-funnel","talk_to_coach");
    a.innerHTML="Talk to a coach <small>Free · 10 min · no payment</small>";
    wrap.appendChild(a);
  }

  function pointTalkLinks(){
    document.querySelectorAll('a[href*="talk-to-a-coach"],a[href*="book-a-free-call"]').forEach(function(a){
      a.setAttribute("href","#lx-home-consult");
      if(a.classList.contains("header-actions__action")){
        var label=a.querySelector(".lurvox-talk-cta__label");
        if(!label){
          label=document.createElement("span");
          label.className="lurvox-talk-cta__label";
          a.appendChild(label);
        }
        label.textContent="Talk";
      }
    });
  }

  function placeCoachInsta(){
    if(document.getElementById("lx-coach-insta"))return;
    var goal=document.querySelector('[id*="ai_gen_block_361650c"]')||document.querySelector('[class*="ai-transformation-plan-"]');
    var host=goal&&(goal.closest(".shopify-block")||goal);
    var plans=document.getElementById("plans");
    var wrap=document.createElement("div");
    wrap.innerHTML=${JSON.stringify(COACH_INSTA_CTA)};
    var el=wrap.firstElementChild;
    if(!el)return;
    if(host&&host.parentNode)host.parentNode.insertBefore(el,host);
    else if(plans&&plans.parentNode){
      var box=plans.parentElement&&plans.parentElement.tagName==="DIV"?plans.parentElement:plans;
      box.parentNode.insertBefore(el,box.nextSibling);
    }
  }

  function boot(){
    placeCoachInsta();
    addHeroTalk();
    addTalkHeaderCta();
    pointTalkLinks();
    document.querySelectorAll("[data-lx-consult-form]").forEach(bindForm);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
  setTimeout(boot,400);
})();
</script>`

function placeConsultForm(html: string): string {
  if (html.includes('id="lx-home-consult"')) {
    return html.replace(
      /<section\b[^>]*id="lx-home-consult"[^>]*>[\s\S]*?<\/section>/i,
      CONSULT_FORM,
    )
  }
  const withForm = html.replace(
    /<form\b[^>]*action="[^"]*contact[^"]*"[^>]*>[\s\S]*?<\/form>/i,
    CONSULT_FORM,
  )
  if (withForm !== html) return withForm
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${CONSULT_FORM}</body>`)
  return html + CONSULT_FORM
}

function injectHomeCoachForm(html: string): string {
  const withForm = placeConsultForm(html)
  let next = withForm.includes('id="lx-home-consult-css"')
    ? withForm.replace(/<style id="lx-home-consult-css">[\s\S]*?<\/style>/, CONSULT_STYLE)
    : withForm
  if (next.includes('id="lx-home-coach-form"')) {
    return next.replace(/<script id="lx-home-coach-form">[\s\S]*?<\/script>/, CONSULT_SCRIPT)
  }
  const boot = `${next.includes('id="lx-home-consult-css"') ? '' : CONSULT_STYLE}${CONSULT_SCRIPT}`
  if (/<\/body>/i.test(next)) return next.replace(/<\/body>/i, `${boot}</body>`)
  return next + boot
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
