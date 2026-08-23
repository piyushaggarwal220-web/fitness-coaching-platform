/**
 * URGENT: Fix LURVOX homepage photo carousel autoplay.
 *
 * - REMOVE autoplay from Fitness gallery (top) + Member wins
 * - KEEP autoplay ONLY on Client results / transformation gallery
 * - NEVER use scrollIntoView / focus / window.scrollTo during autoplay
 * - Advance by scrolling the carousel container's scrollLeft only
 *
 * Deploys via layout/theme.liquid (storefront picks this up; AI-gen blocks can be stale).
 * Also patches theme block assets for consistency.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const THEME = '161086767355'
const outDir = 'C:/Users/DELL/coaching-platform/scripts'
const OLD_MARKERS = [
  'lurvox-photo-carousel-autoplay-v1',
  'lurvox-photo-carousel-autoplay-v2',
]
const MARKER = 'lurvox-photo-carousel-autoplay-v3'

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

function stripAutoplayMarkerBlocks(layout) {
  let out = layout
  for (const m of [...OLD_MARKERS, MARKER]) {
    out = out.replace(
      new RegExp(
        `\\s*\\{%-?\\s*comment\\s*-?%\\}\\s*${m}[\\s\\S]*?\\{%\\s*endif\\s*%\\}`,
        'g'
      ),
      ''
    )
  }
  return out
}

const AUTOPLAY_SNIPPET = `
  {%- comment -%} ${MARKER} {%- endcomment -%}
  {% if template.name == 'index' %}
  <script>
    (function () {
      if (window.__lurvoxPhotoCarouselAutoplayV3) return;
      window.__lurvoxPhotoCarouselAutoplayV3 = true;

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

      /** Scroll ONLY the gallery element — never scrollIntoView / focus / window scroll. */
      function scrollGalleryToCard(gallery, card) {
        if (!gallery || !card) return;
        var targetLeft = card.offsetLeft - (gallery.clientWidth - card.offsetWidth) / 2;
        if (targetLeft < 0) targetLeft = 0;
        var max = Math.max(0, gallery.scrollWidth - gallery.clientWidth);
        if (targetLeft > max) targetLeft = max;
        gallery.scrollTo({ left: targetLeft, behavior: 'smooth' });
      }

      function initClientResultsOnly() {
        document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
          var isClientResults =
            (gallery.className && String(gallery.className).indexOf('ai-client-results-gallery') !== -1) ||
            !!gallery.closest('[class*="ai-client-results-"]');
          if (!isClientResults) return;

          var cards = gallery.querySelectorAll('[data-card]');
          if (cards.length < 2) return;

          var root =
            gallery.closest('.shopify-block') ||
            gallery.closest('[class*="ai-client-results-"]') ||
            gallery.parentElement;

          bindAutoplay(root, function () {
            var list = Array.prototype.slice.call(cards);
            var active = gallery.querySelector('[data-card].active') || list[0];
            var current = list.indexOf(active);
            if (current < 0) current = 0;
            var next = list[(current + 1) % list.length];
            if (!next) return;

            // Do NOT click nav buttons (block JS may still use scrollIntoView)
            list.forEach(function (c) { c.classList.remove('active'); });
            next.classList.add('active');
            scrollGalleryToCard(gallery, next);
          });
        });
      }

      function initAll() {
        // Intentionally NO fitness gallery / member wins autoplay
        initClientResultsOnly();
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

function replaceClientResultsScrollIntoView(content) {
  return content.replace(
    /const nextCard = this\.cards\[nextIndex\];\s*if \(nextCard\) \{\s*nextCard\.scrollIntoView\(\{\s*behavior: 'smooth',\s*block: 'nearest',\s*inline: 'center'\s*\}\);\s*\}/,
    `const nextCard = this.cards[nextIndex];
        if (nextCard && this.gallery) {
          const targetLeft = nextCard.offsetLeft - (this.gallery.clientWidth - nextCard.offsetWidth) / 2;
          this.gallery.scrollTo({
            left: Math.max(0, Math.min(targetLeft, this.gallery.scrollWidth - this.gallery.clientWidth)),
            behavior: 'smooth'
          });
        }`
  )
}

function replaceFitnessScrollIntoView(content) {
  return content.replace(
    /const slide = this\.querySelector\(`\[data-slide="\$\{index \+ 1\}"\]`\);\s*if \(slide\) \{\s*slide\.scrollIntoView\(\{\s*behavior: 'smooth',\s*block: 'nearest',\s*inline: 'center'\s*\}\);\s*\}/,
    `const slide = this.querySelector(\`[data-slide="\${index + 1}"]\`);
        if (slide && this.galleryMain) {
          const targetLeft = slide.offsetLeft - (this.galleryMain.clientWidth - slide.offsetWidth) / 2;
          this.galleryMain.scrollTo({
            left: Math.max(0, Math.min(targetLeft, this.galleryMain.scrollWidth - this.galleryMain.clientWidth)),
            behavior: 'smooth'
          });
        }`
  )
}

function stripBlockAutoplay(src) {
  if (!src.includes('setupAutoplay()') && !src.includes('_autoplayMs')) {
    return { content: src, changed: false }
  }

  let content = src

  content = content.replace(
    /\n\s*if \(this\.(?:totalSlides|cards\.length) > 1\) this\.setupAutoplay\(\);/g,
    ''
  )
  content = content.replace(/\n\s*this\.setupAutoplay\(\);/g, '')

  // Remove pause/resume around manual interactions
  content = content.replace(/\n\s*this\.pauseAutoplay\(\);/g, '')
  content = content.replace(/\n\s*this\.scheduleResumeAutoplay\(\);/g, '')

  content = content.replace(/\n\s*autoAdvance\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(/\n\s*setupAutoplay\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(/\n\s*startAutoplay\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(/\n\s*stopAutoplay\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(/\n\s*pauseAutoplay\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(/\n\s*scheduleResumeAutoplay\(\) \{[\s\S]*?\n\s*\}/g, '')
  content = content.replace(
    /\n\s*disconnectedCallback\(\) \{\s*this\.stopAutoplay\(\);[\s\S]*?\n\s*\}/g,
    ''
  )
  // orphaned disconnectedCallback that only clears autoplay timers
  content = content.replace(
    /\n\s*disconnectedCallback\(\) \{\n\s*this\.stopAutoplay\(\);\n\s*if \(this\._resumeTimer\) clearTimeout\(this\._resumeTimer\);\n\s*\}/g,
    ''
  )

  return { content, changed: content !== src }
}

function stampComment(content) {
  const stamp = `{%- comment -%} lurvox-carousel-fix ${MARKER} ${new Date().toISOString()} {%- endcomment -%}\n`
  if (content.includes('lurvox-carousel-fix')) {
    return content.replace(
      /\{%- comment -%\} lurvox-carousel-fix[\s\S]*?\{%- endcomment -%\}\n?/,
      stamp
    )
  }
  return stamp + content
}

// --- 1) Layout (authoritative for live storefront) ---
let layout = await getAsset('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')

layout = stripAutoplayMarkerBlocks(layout)
if (!layout.includes('</body>')) throw new Error('layout missing </body>')
layout = layout.replace('</body>', `${AUTOPLAY_SNIPPET}\n</body>`)

fs.writeFileSync(path.join(outDir, 'tmp-live-layout-theme.liquid'), layout)
const layoutPut = await putAsset('layout/theme.liquid', layout)

// --- 2) Patch block assets ---
const blockKeys = [
  { key: 'blocks/ai_gen_block_52353f6.liquid', role: 'fitness' },
  { key: 'blocks/ai_gen_block_a7d1b3c.liquid', role: 'member' },
  { key: 'blocks/ai_gen_block_cd3c949.liquid', role: 'transform' },
  { key: 'blocks/ai_gen_block_3cbb200.liquid', role: 'transform' },
]

const blockResults = []
for (const { key, role } of blockKeys) {
  let src = await getAsset(key)
  if (!src) {
    blockResults.push({ key, skipped: true, reason: 'missing' })
    continue
  }

  const short = key.replace('blocks/', '').replace('.liquid', '')
  let content = src
  const actions = []

  if (role === 'transform') {
    const before = content
    content = replaceClientResultsScrollIntoView(content)
    if (content !== before) actions.push('gallery-scrollTo-instead-of-scrollIntoView')

    if (!content.includes('setupAutoplay()')) {
      actions.push('WARNING-no-autoplay-in-block-layout-handles-it')
    } else {
      actions.push('kept-block-autoplay')
    }

    if (content.includes('scrollIntoView')) {
      actions.push('WARNING-scrollIntoView-still-present')
    }
  } else {
    const stripped = stripBlockAutoplay(content)
    content = stripped.content
    if (stripped.changed) actions.push('removed-autoplay')
    else actions.push('no-autoplay-found')

    if (role === 'fitness') {
      const before = content
      content = replaceFitnessScrollIntoView(content)
      if (content !== before) actions.push('manual-nav-container-scroll')
    }
  }

  content = stampComment(content)
  fs.writeFileSync(path.join(outDir, `tmp-fixed-${short}.liquid`), content)

  const put = await putAsset(key, content)
  blockResults.push({
    key,
    role,
    put,
    actions,
    hasSetupAutoplay: content.includes('setupAutoplay()'),
    hasSetInterval: content.includes('setInterval'),
    hasScrollIntoView: content.includes('scrollIntoView'),
    bytes: content.length,
  })
}

await new Promise((r) => setTimeout(r, 3000))

// --- 3) Verify ---
const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${THEME}&cb=${Date.now()}`,
]

const pages = []
for (const url of urls) {
  const html = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 carousel-fix-v3' },
  }).then((r) => r.text())

  const afterMarker = html.includes(MARKER) ? html.split(MARKER)[1]?.split('</script>')[0] || '' : ''

  pages.push({
    url,
    hasV3: html.includes(MARKER),
    noV1: !html.includes('lurvox-photo-carousel-autoplay-v1'),
    hasInitClientOnly: html.includes('initClientResultsOnly'),
    noInitFitness: !html.includes('initFitnessGalleries'),
    noInitMember: !html.includes('initMemberWins'),
    snippetHasScrollIntoView: afterMarker.includes('scrollIntoView'),
    hasScrollGalleryToCard: html.includes('scrollGalleryToCard'),
    hasV3Guard: html.includes('__lurvoxPhotoCarouselAutoplayV3'),
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      layoutPut,
      marker: MARKER,
      blockResults,
      pages,
      note: 'Live storefront driven by layout v3: transformation-only autoplay via gallery.scrollTo; fitness/member autoplay removed.',
    },
    null,
    2
  )
)
