/**
 * Deploy photo-carousel autoplay via layout/theme.liquid.
 *
 * Why layout: AI-gen block liquid upserts update Admin assets but the live
 * storefront keeps serving a stale compiled copy of those blocks (confirmed
 * with an HTML marker). Layout/theme.liquid updates DO reach the storefront.
 *
 * Behavior: 3.5s auto-advance; pause on pointer/touch; resume 2.5s after leave/end.
 * Targets Fitness gallery, Member wins, Client results on the homepage.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const THEME = '161086767355'
const outDir = 'C:/Users/DELL/coaching-platform/scripts'
const MARKER = 'lurvox-photo-carousel-autoplay-v1'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

async function getAsset(key) {
  const json = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  return json.asset?.value ?? null
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json.errors || json)}`)
  return { key: json.asset.key, updated_at: json.asset.updated_at }
}

const AUTOPLAY_SNIPPET = `
  {%- comment -%} ${MARKER} {%- endcomment -%}
  {% if template.name == 'index' %}
  <script>
    (function () {
      if (window.__lurvoxPhotoCarouselAutoplay) return;
      window.__lurvoxPhotoCarouselAutoplay = true;

      var AUTO_MS = 3500;
      var RESUME_MS = 2500;

      function bindAutoplay(root, advance) {
        if (!root || root.getAttribute('data-lurvox-autoplay') === '1') return;
        root.setAttribute('data-lurvox-autoplay', '1');

        var timer = null;
        var resumeTimer = null;
        var paused = false;

        function stop() {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }

        function start() {
          stop();
          if (paused) return;
          timer = setInterval(function () {
            try { advance(); } catch (e) {}
          }, AUTO_MS);
        }

        function pause() {
          paused = true;
          stop();
          if (resumeTimer) {
            clearTimeout(resumeTimer);
            resumeTimer = null;
          }
        }

        function scheduleResume() {
          if (resumeTimer) clearTimeout(resumeTimer);
          resumeTimer = setTimeout(function () {
            paused = false;
            resumeTimer = null;
            start();
          }, RESUME_MS);
        }

        root.addEventListener('pointerdown', pause);
        root.addEventListener('touchstart', pause, { passive: true });
        root.addEventListener('mousedown', pause);
        root.addEventListener('pointerup', scheduleResume);
        root.addEventListener('touchend', scheduleResume);
        root.addEventListener('mouseup', scheduleResume);
        root.addEventListener('mouseleave', scheduleResume);
        root.addEventListener('pointerleave', scheduleResume);

        start();
      }

      function initFitnessGalleries() {
        document.querySelectorAll('[data-gallery-main]').forEach(function (main) {
          var slides = main.querySelectorAll('[data-slide]');
          if (slides.length < 2) return;
          var root = main.closest('.shopify-block') || main.closest('[class*="ai-fitness-gallery-"]') || main.parentElement;
          var idx = 0;

          // Keep idx in sync with scroll position when possible
          main.addEventListener('scroll', function () {
            var center = main.scrollLeft + main.clientWidth / 2;
            var best = 0;
            var bestDist = Infinity;
            for (var i = 0; i < slides.length; i++) {
              var left = slides[i].offsetLeft + slides[i].offsetWidth / 2;
              var dist = Math.abs(left - center);
              if (dist < bestDist) {
                bestDist = dist;
                best = i;
              }
            }
            idx = best;
          }, { passive: true });

          bindAutoplay(root, function () {
            idx = (idx + 1) % slides.length;
            slides[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          });
        });
      }

      function initClientResults() {
        document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
          var cards = gallery.querySelectorAll('[data-card]');
          if (cards.length < 2) return;
          var root = gallery.closest('.shopify-block') || gallery.closest('[class*="ai-client-results-"]') || gallery.parentElement;
          var nextBtn = root.querySelector('[data-nav="next"]');

          bindAutoplay(root, function () {
            if (nextBtn) {
              nextBtn.click();
              return;
            }
            var active = gallery.querySelector('[data-card].active') || cards[0];
            var list = Array.prototype.slice.call(cards);
            var current = list.indexOf(active);
            var next = list[(current + 1) % list.length];
            if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          });
        });
      }

      function initMemberWins() {
        document.querySelectorAll('[class*="ai-member-wins-carousel-"]').forEach(function (carousel) {
          if (carousel.tagName === 'BUTTON') return;
          var cards = carousel.querySelectorAll('[class*="ai-member-wins-card-"]');
          if (cards.length < 2) return;
          var root = carousel.closest('.shopify-block') || carousel.closest('[class*="ai-member-wins-"]') || carousel.parentElement;

          bindAutoplay(root, function () {
            var card = cards[0];
            var gap = 16;
            var amount = card.offsetWidth + gap;
            var maxScroll = carousel.scrollWidth - carousel.clientWidth;
            if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 2) {
              carousel.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
              carousel.scrollBy({ left: amount, behavior: 'smooth' });
            }
          });
        });
      }

      function initAll() {
        initFitnessGalleries();
        initClientResults();
        initMemberWins();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
      } else {
        initAll();
      }
      document.addEventListener('shopify:section:load', initAll);
    })();
  </script>
  {% endif %}
`

let layout = await getAsset('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')

if (layout.includes(MARKER)) {
  // Replace existing snippet block (from comment through matching endif)
  layout = layout.replace(
    new RegExp(
      `\\s*\\{%-?\\s*comment\\s*-?%\\}\\s*${MARKER}[\\s\\S]*?\\{%\\s*endif\\s*%\\}`,
      'g'
    ),
    ''
  )
}

if (!layout.includes('</body>')) throw new Error('layout missing </body>')
layout = layout.replace('</body>', `${AUTOPLAY_SNIPPET}\n</body>`)

fs.writeFileSync(path.join(outDir, 'tmp-live-layout-theme.liquid'), layout)
const put = await putAsset('layout/theme.liquid', layout)

await new Promise((r) => setTimeout(r, 2500))

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
]

const pages = []
for (const url of urls) {
  const html = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 autoplay-layout-verify' },
  }).then((r) => r.text())
  pages.push({
    url,
    marker: html.includes(MARKER),
    autoMs: html.includes('AUTO_MS = 3500'),
    resumeMs: html.includes('RESUME_MS = 2500'),
    fitnessInit: html.includes('initFitnessGalleries'),
    memberInit: html.includes('initMemberWins'),
    clientInit: html.includes('initClientResults'),
    windowGuard: html.includes('__lurvoxPhotoCarouselAutoplay'),
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      put,
      theme: THEME,
      note: 'Block liquid patches remain on theme assets; live storefront served via layout injection because AI-gen block renders are stale.',
      pages,
    },
    null,
    2
  )
)
