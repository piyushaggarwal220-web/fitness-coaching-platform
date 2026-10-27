import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src/app/landing.css'), 'utf8')

const html = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<div class="landing lx-live">
  <header class="lx-header">
    <div class="lx-nav">
      <nav class="lx-nav-links" aria-label="Page">
        <a href="#system">What’s included</a>
        <a href="#coaching">Coaches</a>
        <a href="#method">How it works</a>
        <a href="#pricing">Plans</a>
      </nav>
      <a href="#top" class="lx-logo">LURVOX</a>
      <div class="lx-nav-actions">
        <a class="lx-btn lx-btn-ghost lx-login" href="https://app.lurvox.in/login">Client login</a>
      </div>
    </div>
  </header>
  <main>
    <section class="lx-hero" id="top">
      <div class="lx-hero-copy">
        <p class="lx-eyebrow">Online coaching</p>
        <h1 id="lx-title">An athletic body.</h1>
        <p class="lx-lead" id="lx-lead">Best for building an athletic body — fat loss, muscle gain, and stamina. First plan in 24–48 hours.</p>
        <div class="lx-switch" id="lx-plans" role="tablist" aria-label="Coaching plans">
          <button type="button" role="tab" aria-selected="false" data-plan="fat">Fat loss</button>
          <button type="button" role="tab" aria-selected="false" data-plan="muscle">Muscle</button>
          <button type="button" role="tab" class="is-on" aria-selected="true" data-plan="athletic">Athletic</button>
        </div>
        <div class="lx-hero-photo">
          <img id="lx-hero-photo" class="lx-cover" src="{{ 'lurvox-2026-hero-athletic.webp' | asset_url }}" alt="Muscular man running in shorts along a waterfront at dawn">
        </div>
        <p class="lx-price">
          <strong id="lx-price">₹1,699</strong>
          <em id="lx-meta">₹142 a month · 12 months</em>
        </p>
        <div class="lx-actions">
          <a class="lx-btn lx-btn-primary lx-btn-block" id="lx-cta" href="https://app.lurvox.in/checkout?plan=12_months">Start for ₹1,699</a>
        </div>
      </div>
    </section>

    <section class="lx-fail" id="why">
      <p class="lx-eyebrow">With LURVOX</p>
      <h2>Why you won't fail with us.</h2>
      <p class="lx-lead">The plan is built for your case, and it does not stop at a file.</p>
      <div class="lx-stage">
        <img id="lx-why-photo" class="lx-cover" src="{{ 'lurvox-2026-why-plan.webp' | asset_url }}" alt="Man at a kitchen table with a closed notebook before training">
        <div class="lx-stage-copy">
          <h2 id="lx-why-title">Your plan</h2>
          <p id="lx-why-body">The workout and the diet are built around your goal, schedule, food, and where you train.</p>
        </div>
      </div>
      <div class="lx-stage-nav lx-quad-nav" id="lx-why-tabs" role="tablist" aria-label="Why you won't fail with us">
        <button type="button" role="tab" class="is-on" aria-selected="true" data-why="1"><img src="{{ 'lurvox-2026-why-plan.webp' | asset_url }}" alt=""><span>Your plan</span></button>
        <button type="button" role="tab" aria-selected="false" data-why="2"><img src="{{ 'lurvox-2026-why-keeps.webp' | asset_url }}" alt=""><span>It keeps up</span></button>
        <button type="button" role="tab" aria-selected="false" data-why="3"><img src="{{ 'lurvox-2026-why-principles.webp' | asset_url }}" alt=""><span>Made with tested principles</span></button>
        <button type="button" role="tab" aria-selected="false" data-why="4"><img src="{{ 'lurvox-2026-why-work.webp' | asset_url }}" alt=""><span>The work is decided</span></button>
      </div>
    </section>

    <section class="lx-system" id="system">
      <p class="lx-eyebrow">What you get</p>
      <h2>One system. Your case.</h2>
      <p class="lx-lead">Get trained with professional principles, backed by science, not random things.</p>
      <ul class="lx-include">
        <li>Personal workout plan (gym, home, or both)</li>
        <li>Personal diet plan around your food and schedule</li>
        <li>1-to-1 coaching in the app — your case, your plan</li>
        <li>Mid week + weekly check ins</li>
        <li>Daily trackers: workout, meals, water, sleep, steps, habits</li>
        <li>Journey + progress photos</li>
      </ul>
      <div class="lx-stage">
        <img id="lx-system-photo" class="lx-cover" src="{{ 'lurvox-2026-training.webp' | asset_url }}" alt="Man performing a seated cable row">
        <div class="lx-stage-split" id="lx-system-split" hidden>
          <img src="{{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url }}" alt="Piyush Aggarwal, LURVOX coach">
          <img src="{{ 'lurvox-2026-coach-rakshit-dark.webp' | asset_url }}" alt="Rakshit Mohla, LURVOX coach">
        </div>
        <div class="lx-stage-copy">
          <h2 id="lx-system-title">Workout</h2>
          <p id="lx-system-body">Sessions for your goal, level, and equipment.</p>
        </div>
      </div>
      <div class="lx-stage-nav" id="lx-system-tabs" role="tablist" aria-label="Parts of the coaching">
        <button type="button" role="tab" class="is-on" aria-selected="true" data-tab="workout"><img src="{{ 'lurvox-2026-training.webp' | asset_url }}" alt=""><span>Workout</span></button>
        <button type="button" role="tab" aria-selected="false" data-tab="diet"><img src="{{ 'lurvox-2026-nutrition.webp' | asset_url }}" alt=""><span>Diet</span></button>
        <button type="button" role="tab" aria-selected="false" data-tab="track"><img src="{{ 'lurvox-2026-tracking.webp' | asset_url }}" alt=""><span>Track</span></button>
        <button type="button" role="tab" aria-selected="false" data-tab="coach"><span class="lx-thumb-split"><img src="{{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url }}" alt=""><img src="{{ 'lurvox-2026-coach-rakshit-dark.webp' | asset_url }}" alt=""></span><span>Coach</span></button>
        <button type="button" role="tab" aria-selected="false" data-tab="checkin"><img src="{{ 'lurvox-2026-checkin.webp' | asset_url }}" alt=""><span>Check-in</span></button>
        <button type="button" role="tab" aria-selected="false" data-tab="progress"><img src="{{ 'lurvox-2026-progress.webp' | asset_url }}" alt=""><span>Progress</span></button>
      </div>
    </section>

    <section class="lx-coaches" id="coaching">
      <div class="lx-coaches-copy">
        <p class="lx-eyebrow">The method</p>
        <h2>Get trained with professional principles.</h2>
        <p class="lx-lead">Backed by science, not random things.</p>
      </div>
      <div class="lx-stage">
        <a id="lx-coach-link" href="https://www.instagram.com/maximusvault/" target="_blank" rel="noopener noreferrer">
          <img id="lx-coach-photo" class="lx-cover" src="{{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url }}" alt="Piyush Aggarwal, LURVOX coach">
        </a>
        <div class="lx-stage-copy">
          <h2 id="lx-coach-name">Piyush Aggarwal</h2>
          <p id="lx-coach-handle">@maximusvault</p>
          <p>Tap to open Instagram</p>
        </div>
      </div>
      <div class="lx-stage-nav lx-coach-nav" id="lx-coach-tabs" role="tablist" aria-label="Coaches">
        <button type="button" role="tab" class="is-on" aria-selected="true" data-coach="piyush"><img src="{{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url }}" alt=""><span>Piyush</span></button>
        <button type="button" role="tab" aria-selected="false" data-coach="rakshit"><img src="{{ 'lurvox-2026-coach-rakshit-dark.webp' | asset_url }}" alt=""><span>Rakshit</span></button>
      </div>
    </section>

    <section class="lx-method" id="method">
      <h2>How it works.</h2>
      <div class="lx-stage lx-method-stage">
        <img id="lx-method-photo" class="lx-cover" src="{{ 'lurvox-2026-intake.webp' | asset_url }}" alt="Woman with coffee and a gym bag before training">
        <div class="lx-stage-copy">
          <h2 id="lx-method-title">Tell us about you.</h2>
          <p id="lx-method-body">Goals, schedule, food, and where you train.</p>
        </div>
      </div>
      <div class="lx-stage-nav lx-method-nav" id="lx-method-tabs" role="tablist" aria-label="How it works">
        <button type="button" role="tab" class="is-on" aria-selected="true" data-step="1"><img src="{{ 'lurvox-2026-intake.webp' | asset_url }}" alt=""><span>Tell us about you</span></button>
        <button type="button" role="tab" aria-selected="false" data-step="2"><img src="{{ 'lurvox-2026-plan.webp' | asset_url }}" alt=""><span>Get your plan</span></button>
        <button type="button" role="tab" aria-selected="false" data-step="3"><img src="{{ 'lurvox-2026-method-work.webp' | asset_url }}" alt=""><span>Do the work</span></button>
        <button type="button" role="tab" aria-selected="false" data-step="4"><img src="{{ 'lurvox-2026-method-adapt.webp' | asset_url }}" alt=""><span>Adapt</span></button>
      </div>
    </section>

    <section class="lx-pricing" id="pricing">
      <p class="lx-eyebrow">Plans</p>
      <h2>Choose your plan.</h2>
      <p class="lx-shared">Every plan includes personalized coaching, a workout, a diet, tracking and coach check-ins. A free upgrade is available for 48 hours. After that, an upgrade is ₹250.</p>
      <div class="lx-plans">
        <article>
          <p class="lx-kicker">90 days</p>
          <h3>Fat loss</h3>
          <p class="lx-plan-price">₹599<em>₹200 a month</em></p>
          <ul class="lx-points">
            <li>Workout and diet for your case</li>
            <li>Professional principles, backed by science</li>
            <li>Check-ins and daily tracking</li>
            <li>Updates every 14 days</li>
          </ul>
          <a class="lx-btn lx-btn-primary lx-btn-block" href="https://app.lurvox.in/checkout?plan=3_months">Start for ₹599</a>
        </article>
        <article class="is-popular">
          <p class="lx-kicker">6 months <span class="lx-tag">Most popular</span></p>
          <h3>Fat loss + muscle gain</h3>
          <p class="lx-plan-price">₹999<em>₹167 a month</em></p>
          <ul class="lx-points">
            <li>Everything in Fat loss</li>
            <li>Updates every week</li>
            <li>Cardio plan</li>
            <li>Supplement plan</li>
            <li>Plateau coaching after 90 days</li>
          </ul>
          <a class="lx-btn lx-btn-primary lx-btn-block" href="https://app.lurvox.in/checkout?plan=6_months">Start for ₹999</a>
        </article>
        <article class="is-best">
          <p class="lx-kicker">12 months <span class="lx-tag">Lowest monthly</span></p>
          <h3>Athletic body</h3>
          <p class="lx-plan-price">₹1,699<em>₹142 a month</em></p>
          <ul class="lx-points">
            <li>Everything in Fat loss + muscle gain</li>
            <li>Stamina coaching</li>
            <li>Weekly updates for 12 months</li>
            <li>Cardio and supplements, kept current</li>
            <li>Plateau coaching through the year</li>
            <li>Lowest rate, ₹142 a month</li>
          </ul>
          <a class="lx-btn lx-btn-primary lx-btn-block" href="https://app.lurvox.in/checkout?plan=12_months">Start for ₹1,699</a>
        </article>
      </div>
    </section>

    <section class="lx-faq" id="faq">
      <h2>Questions</h2>
      <details><summary>What is LURVOX?</summary><p>Online fitness coaching. A personal workout, a personal diet, tracking, and a coach in the app.</p></details>
      <details><summary>What do I receive?</summary><p>The plan for the goal you choose, check-ins, daily tracking, and coach chat. The 3-month plan updates every 14 days. The 6- and 12-month plans update every week.</p></details>
      <details><summary>What is the training based on?</summary><p>Professional principles, backed by science. Not random workouts or diets.</p></details>
      <details><summary>When do I receive my plan?</summary><p>After you finish onboarding. The first plan is prepared in 24 to 48 hours.</p></details>
      <details><summary>Do I need a gym?</summary><p>No. The plan uses a gym, home, or a mix, based on what you have.</p></details>
      <details><summary>Can I message my coach?</summary><p>Yes, in the app, once your coaching access is active.</p></details>
      <details><summary>What happens during weekly check-ins?</summary><p>You submit the week, including photos when they are required. Your coach reviews it and the plan can change from that.</p></details>
      <details><summary>What is the refund policy?</summary><p>Sales are final once payment is captured, except where the Terms say otherwise. The Terms are the only refund rules.</p></details>
      <p class="lx-note"><a href="https://app.lurvox.in/terms#payments-refunds-guarantees">Read the Terms</a></p>
    </section>

    <section class="lx-final">
      <div class="lx-final-copy">
        <h2>Your next 90 days start here.</h2>
        <p class="lx-price"><span>Starting from</span><strong>₹599</strong></p>
        <a class="lx-btn lx-btn-primary" href="https://app.lurvox.in/checkout?plan=3_months">Start for ₹599</a>
      </div>
    </section>
  </main>
  <footer class="lx-footer">
    <strong>LURVOX</strong>
    <p>Online fitness coaching.</p>
    <p>14, Sector 44, Golf Course Road, Gurugram, Haryana 122003</p>
    <p><a href="mailto:hello@lurvox.in">hello@lurvox.in</a></p>
    <p>
      <a href="https://app.lurvox.in/terms">Terms</a>
      <a href="https://app.lurvox.in/refund-policy">Refund policy</a>
      <a href="https://app.lurvox.in/login">Log in</a>
    </p>
    <p>Secure payments via Razorpay. Results vary.</p>
  </footer>
  <div class="lx-sticky" id="lx-sticky">
    <a class="lx-btn lx-btn-primary lx-btn-block" id="lx-sticky-cta" href="https://app.lurvox.in/checkout?plan=12_months">Start for ₹1,699</a>
  </div>
</div>
`

const shopifyCss = `
body:has(.lx-live),
body:has(.lx-live) .gradient {
  background: #f4efe6 !important;
  background-image: none !important;
  color: #1c1915;
}
body:has(.lx-live) main h1::before,
body:has(.lx-live) main h2::before {
  content: none !important;
  display: none !important;
  background: none !important;
}
body:has(.lx-live) main a,
body:has(.lx-live) main a:hover,
body:has(.lx-live) main button,
body:has(.lx-live) main button:hover {
  text-shadow: none !important;
}
body:has(.lx-live) .header-group,
body:has(.lx-live) .footer-group,
body:has(.lx-live) #shopify-section-header,
body:has(.lx-live) #shopify-section-footer,
body:has(.lx-live) .announcement-bar-section,
body:has(.lx-live) .shopify-section-group-header,
body:has(.lx-live) .shopify-section-group-footer {
  display: none !important;
}
body:has(.lx-live) .shopify-section:not(:has(.lx-live)) { display: none !important; }
body:has(.lx-live) #lx-mchat { display: none !important; }
.lx-live img {
  border: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}
.lx-live .lx-stage::before,
.lx-live .lx-stage::after,
.lx-live .lx-hero-photo::before,
.lx-live .lx-hero-photo::after {
  content: none !important;
  display: none !important;
  border: 0 !important;
}
.shopify-section:has(.lx-live) {
  padding: 0 !important;
  margin: 0 !important;
  max-width: none !important;
}
.landing {
  --font-inter: "Manrope", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}
.landing [hidden] { display: none !important; }
.landing button {
  appearance: none;
  font-family: inherit;
}
`

const script = `
<script>
  (function () {
    var plans = {
      fat: { title: 'Your fat loss plan.', lead: 'Best for a 90-day fat-loss push. First plan in 24–48 hours.', price: '₹599', meta: '₹200 a month · 90 days', href: 'https://app.lurvox.in/checkout?plan=3_months', img: {{ 'lurvox-2026-hero-fat-loss.webp' | asset_url | json }}, alt: 'Man walking uphill on a treadmill in a private gym' },
      muscle: { title: 'Fat loss and muscle.', lead: 'Best for losing fat while building muscle. First plan in 24–48 hours.', price: '₹999', meta: '₹167 a month · 6 months', href: 'https://app.lurvox.in/checkout?plan=6_months', img: {{ 'lurvox-2026-hero-muscle.webp' | asset_url | json }}, alt: 'Man in a heavy squat in a private studio' },
      athletic: { title: 'An athletic body.', lead: 'Best for building an athletic body — fat loss, muscle gain, and stamina. First plan in 24–48 hours.', price: '₹1,699', meta: '₹142 a month · 12 months', href: 'https://app.lurvox.in/checkout?plan=12_months', img: {{ 'lurvox-2026-hero-athletic.webp' | asset_url | json }}, alt: 'Muscular man running in shorts along a waterfront at dawn' }
    }
    var system = {
      workout: { title: 'Workout', body: 'Sessions for your goal, level, and equipment.', img: {{ 'lurvox-2026-training.webp' | asset_url | json }}, alt: 'Man performing a seated cable row', split: false },
      diet: { title: 'Diet', body: 'Meals around your food and schedule.', img: {{ 'lurvox-2026-nutrition.webp' | asset_url | json }}, alt: 'A plated meal of chicken, rice, roti, and greens', split: false },
      track: { title: 'Track', body: 'Log the workout and the meals, then leave.', img: {{ 'lurvox-2026-tracking.webp' | asset_url | json }}, alt: 'Woman reviewing her day on a phone after training', split: false },
      coach: { title: 'Coach', body: 'Professional principles, backed by science. Not a random plan.', img: {{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url | json }}, alt: 'Piyush Aggarwal, LURVOX coach', split: true },
      checkin: { title: 'Check-in', body: 'Mid-week and weekly. Weight, measurements, and photos when they are required.', img: {{ 'lurvox-2026-checkin.webp' | asset_url | json }}, alt: 'Woman by a window during a weekly check-in', split: false },
      progress: { title: 'Progress', body: 'Weight, photos, and the plan that follows.', img: {{ 'lurvox-2026-progress.webp' | asset_url | json }}, alt: 'Man leaving a private gym after training', split: false }
    }
    var steps = {
      '1': { title: 'Tell us about you.', body: 'Goals, schedule, food, and where you train.', img: {{ 'lurvox-2026-intake.webp' | asset_url | json }}, alt: 'Woman with coffee and a gym bag before training' },
      '2': { title: 'Get your plan.', body: 'Workout and diet, prepared for your case.', img: {{ 'lurvox-2026-plan.webp' | asset_url | json }}, alt: 'Man reading a phone after training' },
      '3': { title: 'Do the work.', body: 'Train, eat, and log it in the app.', img: {{ 'lurvox-2026-method-work.webp' | asset_url | json }}, alt: 'Woman rowing in a quiet private studio' },
      '4': { title: 'Adapt.', body: 'Check in. The plan changes from what you actually did.', img: {{ 'lurvox-2026-method-adapt.webp' | asset_url | json }}, alt: 'Man on a balcony after training, looking out at dusk' }
    }
    function mark(group, button) {
      group.querySelectorAll('button').forEach(function (item) {
        var on = item === button
        item.classList.toggle('is-on', on)
        item.setAttribute('aria-selected', on ? 'true' : 'false')
      })
    }
    document.getElementById('lx-plans').addEventListener('click', function (event) {
      var button = event.target.closest('button')
      if (!button) return
      var plan = plans[button.getAttribute('data-plan')]
      if (!plan) return
      mark(event.currentTarget, button)
      document.getElementById('lx-title').textContent = plan.title
      document.getElementById('lx-lead').textContent = plan.lead
      document.getElementById('lx-price').textContent = plan.price
      document.getElementById('lx-meta').textContent = plan.meta
      var label = 'Start for ' + plan.price
      var cta = document.getElementById('lx-cta')
      var sticky = document.getElementById('lx-sticky-cta')
      cta.textContent = label
      cta.href = plan.href
      sticky.textContent = label
      sticky.href = plan.href
      var photo = document.getElementById('lx-hero-photo')
      photo.src = plan.img
      photo.alt = plan.alt
    })
    var why = {
      '1': { title: 'Your plan', body: 'The workout and the diet are built around your goal, schedule, food, and where you train.', img: {{ 'lurvox-2026-why-plan.webp' | asset_url | json }}, alt: 'Man at a kitchen table with a closed notebook before training' },
      '2': { title: 'It keeps up', body: 'The 3-month plan updates every 14 days. The 6- and 12-month plans update every week.', img: {{ 'lurvox-2026-why-keeps.webp' | asset_url | json }}, alt: 'Man setting a dumbbell down beside a window after a week of training' },
      '3': { title: 'Made with tested principles', body: 'The workout and diet follow professional principles, backed by science, then written for your case.', img: {{ 'lurvox-2026-why-principles.webp' | asset_url | json }}, alt: 'Woman holding a kettlebell in a careful hinge in an empty studio' },
      '4': { title: 'The work is decided', body: 'What to train and what to eat is written. You are not left choosing it alone.', img: {{ 'lurvox-2026-why-work.webp' | asset_url | json }}, alt: 'Man standing ready in front of a loaded barbell' }
    }
    document.getElementById('lx-why-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('button')
      if (!button) return
      var item = why[button.getAttribute('data-why')]
      if (!item) return
      mark(event.currentTarget, button)
      document.getElementById('lx-why-title').textContent = item.title
      document.getElementById('lx-why-body').textContent = item.body
      var photo = document.getElementById('lx-why-photo')
      photo.hidden = false
      photo.src = item.img
      photo.alt = item.alt
    })
    document.getElementById('lx-system-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('button')
      if (!button) return
      var item = system[button.getAttribute('data-tab')]
      if (!item) return
      mark(event.currentTarget, button)
      document.getElementById('lx-system-title').textContent = item.title
      document.getElementById('lx-system-body').textContent = item.body
      var photo = document.getElementById('lx-system-photo')
      var split = document.getElementById('lx-system-split')
      photo.hidden = !!item.split
      split.hidden = !item.split
      if (!item.split) {
        photo.src = item.img
        photo.alt = item.alt
        photo.classList.toggle('is-fit', button.getAttribute('data-tab') === 'coach')
      }
    })
    document.getElementById('lx-method-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('button')
      if (!button) return
      var item = steps[button.getAttribute('data-step')]
      if (!item) return
      mark(event.currentTarget, button)
      document.getElementById('lx-method-title').textContent = item.title
      document.getElementById('lx-method-body').textContent = item.body
      var photo = document.getElementById('lx-method-photo')
      photo.src = item.img
      photo.alt = item.alt
    })
    var coachPeople = {
      piyush: { name: 'Piyush Aggarwal', handle: '@maximusvault', href: 'https://www.instagram.com/maximusvault/', img: {{ 'lurvox-2026-coach-piyush-dark.webp' | asset_url | json }}, alt: 'Piyush Aggarwal, LURVOX coach' },
      rakshit: { name: 'Rakshit Mohla', handle: '@rakshitmohla_', href: 'https://www.instagram.com/rakshitmohla_/', img: {{ 'lurvox-2026-coach-rakshit-dark.webp' | asset_url | json }}, alt: 'Rakshit Mohla, LURVOX coach' }
    }
    document.getElementById('lx-coach-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('button')
      if (!button) return
      var person = coachPeople[button.getAttribute('data-coach')]
      if (!person) return
      mark(event.currentTarget, button)
      document.getElementById('lx-coach-name').textContent = person.name
      document.getElementById('lx-coach-handle').textContent = person.handle
      var photo = document.getElementById('lx-coach-photo')
      photo.src = person.img
      photo.alt = person.alt
      document.getElementById('lx-coach-link').href = person.href
    })
    var pricing = document.getElementById('pricing')
    var heroCta = document.querySelector('.lx-hero .lx-actions')
    var bar = document.getElementById('lx-sticky')
    if (pricing && heroCta && bar && 'IntersectionObserver' in window) {
      var seen = { hero: true, pricing: false }
      var sync = function () { bar.classList.toggle('is-hidden', seen.hero || seen.pricing) }
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === heroCta) seen.hero = entry.isIntersecting
          if (entry.target === pricing) seen.pricing = entry.isIntersecting
        })
        sync()
      }, { threshold: 0.35 })
      observer.observe(heroCta)
      observer.observe(pricing)
      sync()
    }
  })()
</script>
`

const liquid = `${html}
<style>
${shopifyCss}
${css}
</style>
${script}
{% schema %}
{
  "name": "LURVOX campaign",
  "settings": []
}
{% endschema %}
`

const out = path.join(root, 'scripts/shopify-assets/sections-lurvox-campaign.liquid')
fs.writeFileSync(out, liquid)
console.log('wrote', out, liquid.length)
