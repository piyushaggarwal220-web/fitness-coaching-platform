import assert from 'node:assert/strict'
import { preview7LiveHtml } from '../src/lib/landing/preview7-html'

const withContact = preview7LiveHtml(`<head></head><body>
<aside id="lurvox-offer-strip-home">sale</aside>
<div data-lx-hero-cta data-lx-hero-cta-single>
  <a href="/pages/choose-your-plan">Find My Plan — Free Quiz</a>
</div>
<a class="header-actions__action" href="/pages/talk-to-a-coach">icon</a>
<h2>Not sure yet? Talk to a coach</h2>
<form method="post" action="/contact#ContactForm-x">
  <input name="contact[name]" placeholder="Name">
  <input name="contact[phone]" pattern="[0-9\\-]*" placeholder="Phone">
  <button type="submit">Submit</button>
</form>
</body>`)

assert.match(withContact, /id="lx-home-consult"/)
assert.match(withContact, /name="name"/)
assert.match(withContact, /name="email"/)
assert.match(withContact, /name="phone"/)
assert.match(withContact, /\+91 98765 43210/)
assert.doesNotMatch(withContact, /name="preferred_time"/)
assert.doesNotMatch(withContact, /name="gender"/)
assert.doesNotMatch(withContact, /action="\/contact/)
assert.doesNotMatch(withContact, /pattern="\[0-9/)
assert.match(withContact, /location\.origin\+"\/api\/public\/talk-to-a-coach"/)
assert.match(withContact, /addHeroTalk/)
assert.match(withContact, /Free · 10 min · no payment/)
assert.match(withContact, /a\[href="#plans"\]\{display:none!important\}/)
assert.match(withContact, /pointTalkLinks/)
assert.match(withContact, /lurvox-talk-cta__label[\s\S]*display:inline!important/)
assert.match(withContact, /label\.textContent="Talk"/)
assert.match(withContact, /India's best human fitness coaching/)

const hero = preview7LiveHtml(`<head></head><body>
<h2>Personal workout + diet from a real coach. <span>Start in 90 days.</span></h2>
</body>`)
assert.match(hero, /Start the journey within 24 hours/)
assert.doesNotMatch(hero, /Start in 90 days/)

const noContact = preview7LiveHtml(`<head></head><body><p>home</p></body>`)
assert.match(noContact, /id="lx-home-consult"/)
assert.match(noContact, /id="lx-home-coach-form"/)

const reordered = preview7LiveHtml(`<head></head><body>
<section class="hero">hero</section>
<div><section class="lx-wyg" id="what-you-get"><h2>What you get on the platform</h2></section></div>
<div><section class="lx-flow">How it works</section></div>
<div><div id="plans"></div></div>
<div class="shopify-block"><div class="ai-transformation-plan-x"><h2>Pick your goal. We handle the rest.</h2></div></div>
</body>`)
assert.match(
  reordered,
  /id="plans"[\s\S]*Pick your goal[\s\S]*What you get on the platform[\s\S]*How it works/,
)
assert.doesNotMatch(
  reordered,
  /What you get on the platform[\s\S]*id="plans"/,
)
assert.match(reordered, /lx-wyg--cards/)
assert.match(reordered, /A living coaching system\. Not a PDF\./)
assert.match(reordered, /Human coach in the app/)

console.log('verify-preview7-coach-form: ok')
