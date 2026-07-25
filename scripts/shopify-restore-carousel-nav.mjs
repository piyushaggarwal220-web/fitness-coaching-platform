/**
 * Homepage carousel scripts: navigation + autoplay.
 *
 * An earlier autoplay-removal pass deleted the entire <script> block from three
 * AI-gen blocks, so `customElements.define` never ran: prev/next buttons were
 * inert and the galleries could not be advanced at all.
 *
 * This re-adds the element definitions with hard guarantees:
 *  - every scroll targets the gallery container via scrollTo/scrollBy. No
 *    scrollIntoView, no focus(), no window.scrollTo — so neither autoplay nor
 *    the arrows can ever move the page. Page scrolling stays entirely with the
 *    visitor.
 *  - autoplay only runs while the gallery is on screen and the tab is visible,
 *    and pauses on any pointer/touch/wheel/key interaction, resuming later.
 *  - autoplay is skipped for `prefers-reduced-motion: reduce`.
 *
 * Every generated script is brace-balanced and parse-checked before upload.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'
const MARKER = 'lurvox-carousel-nav-restore-v3'
const OLD_MARKERS = ['lurvox-carousel-nav-restore-v1', 'lurvox-carousel-nav-restore-v2']

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

/**
 * Shared autoplay behaviour. `autoplayAdvance()` is implemented per gallery and
 * must only ever scroll the gallery container.
 */
const AUTOPLAY_MIXIN = `
      setupAutoplay() {
        this._autoplayMs = 3800;
        this._resumeMs = 7000;
        this._timer = null;
        this._resumeTimer = null;
        this._inView = false;

        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return;
        }

        // Only a deliberate interaction pauses autoplay — hovering does not,
        // so a resting cursor can never stall the gallery.
        const pauseThenResume = () => {
          this.stopAutoplay();
          if (this._resumeTimer) clearTimeout(this._resumeTimer);
          this._resumeTimer = setTimeout(() => this.startAutoplay(), this._resumeMs);
        };

        ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((eventName) => {
          this.addEventListener(eventName, pauseThenResume, { passive: true });
        });

        const visibility = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              this._inView = entry.isIntersecting;
              if (entry.isIntersecting) {
                this.startAutoplay();
              } else {
                this.stopAutoplay();
              }
            });
          },
          { threshold: 0.25 }
        );
        visibility.observe(this);

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            this.stopAutoplay();
          } else {
            this.startAutoplay();
          }
        });
      }

      startAutoplay() {
        this.stopAutoplay();
        if (!this._inView || document.hidden) return;
        this._timer = setInterval(() => {
          try {
            this.autoplayAdvance();
          } catch (e) {}
        }, this._autoplayMs);
      }

      stopAutoplay() {
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
      }

      disconnectedCallback() {
        this.stopAutoplay();
        if (this._resumeTimer) clearTimeout(this._resumeTimer);
      }
`

const FITNESS_SCRIPT = `<script>
  {%- comment -%} ${MARKER} {%- endcomment -%}
  (function() {
    class FitnessGallery{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
        this.currentIndex = 0;
      }

      connectedCallback() {
        this.galleryMain = this.querySelector('[data-gallery-main]');
        this.thumbs = this.querySelectorAll('[data-thumb]');
        this.slides = this.querySelectorAll('[data-slide]');
        this.prevArrow = this.querySelector('[data-arrow="prev"]');
        this.nextArrow = this.querySelector('[data-arrow="next"]');
        this.totalSlides = this.slides.length;

        if (!this.galleryMain || this.totalSlides === 0) return;

        this.setupEventListeners();
        this.setupScrollSnap();
        this.setupAutoplay();
      }

      setupEventListeners() {
        this.thumbs.forEach((thumb, index) => {
          thumb.addEventListener('click', () => {
            this.scrollToSlide(index);
          });
        });

        if (this.prevArrow) {
          this.prevArrow.addEventListener('click', () => {
            this.scrollToSlide(this.currentIndex - 1);
          });
        }

        if (this.nextArrow) {
          this.nextArrow.addEventListener('click', () => {
            this.scrollToSlide(this.currentIndex + 1);
          });
        }

        this.galleryMain.addEventListener('scroll', () => {
          this.updateActiveThumb();
        });
      }

      setupScrollSnap() {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const slideIndex = parseInt(entry.target.dataset.slide, 10) - 1;
                if (!Number.isNaN(slideIndex)) {
                  this.currentIndex = slideIndex;
                  this.updateActiveThumb();
                }
              }
            });
          },
          {
            root: this.galleryMain,
            threshold: 0.5
          }
        );

        this.slides.forEach((slide) => {
          observer.observe(slide);
        });
      }

      /** Scrolls the gallery container only — never the page. */
      scrollToSlide(index) {
        if (index < 0) index = 0;
        if (index >= this.totalSlides) index = this.totalSlides - 1;

        const slide = this.slides[index];
        if (!slide) return;

        const galleryRect = this.galleryMain.getBoundingClientRect();
        const slideRect = slide.getBoundingClientRect();
        const offset = (slideRect.left - galleryRect.left) - (galleryRect.width - slideRect.width) / 2;
        const target = Math.max(this.galleryMain.scrollLeft + offset, 0);

        this.galleryMain.scrollTo({ left: target, behavior: 'smooth' });
        this.currentIndex = index;
        this.updateActiveThumb();
      }

      autoplayAdvance() {
        const next = (this.currentIndex + 1) % this.totalSlides;
        this.scrollToSlide(next);
      }

      updateActiveThumb() {
        this.thumbs.forEach((thumb, index) => {
          if (index === this.currentIndex) {
            thumb.classList.add('active');
          } else {
            thumb.classList.remove('active');
          }
        });
      }
${AUTOPLAY_MIXIN}    }

    customElements.define('fitness-gallery-{{ ai_gen_id }}', FitnessGallery{{ ai_gen_id }});
  })();
</script>`

const CLIENT_RESULTS_SCRIPT = `<script>
  {%- comment -%} ${MARKER} {%- endcomment -%}
  (function() {
    class ClientResults{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.gallery = this.querySelector('[data-gallery]');
        this.cards = this.querySelectorAll('[data-card]');
        this.navButtons = this.querySelectorAll('[data-nav]');

        if (!this.gallery || this.cards.length === 0) return;

        this.setupIntersectionObserver();
        this.setupNavigation();
        this.setupAutoplay();
      }

      setupIntersectionObserver() {
        const options = {
          root: this.gallery,
          threshold: 0.6
        };

        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.cards.forEach((card) => card.classList.remove('active'));
              entry.target.classList.add('active');
            }
          });
        }, options);

        this.cards.forEach((card) => observer.observe(card));
      }

      setupNavigation() {
        this.navButtons.forEach((button) => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigate(button.dataset.nav);
          });
        });
      }

      navigate(direction) {
        const activeCard = this.querySelector('[data-card].active') || this.cards[0];
        const currentIndex = Math.max(Array.from(this.cards).indexOf(activeCard), 0);
        const total = this.cards.length;
        const nextIndex = direction === 'next'
          ? (currentIndex + 1) % total
          : (currentIndex - 1 + total) % total;

        const nextCard = this.cards[nextIndex];
        if (!nextCard) return;

        this.cards.forEach((card) => card.classList.remove('active'));
        nextCard.classList.add('active');

        /** Scrolls the gallery container only — never the page. */
        const galleryRect = this.gallery.getBoundingClientRect();
        const cardRect = nextCard.getBoundingClientRect();
        const offset = (cardRect.left - galleryRect.left) - (galleryRect.width - cardRect.width) / 2;
        const target = Math.max(this.gallery.scrollLeft + offset, 0);

        this.gallery.scrollTo({ left: target, behavior: 'smooth' });
      }

      autoplayAdvance() {
        this.navigate('next');
      }
${AUTOPLAY_MIXIN}    }

    customElements.define('client-results-{{ ai_gen_id }}', ClientResults{{ ai_gen_id }});
  })();
</script>`

const MEMBER_WINS_SCRIPT = `<script>
  {%- comment -%} ${MARKER} {%- endcomment -%}
  (function() {
    class MemberWinsCarousel{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.carousel = this.querySelector('.ai-member-wins-carousel-{{ ai_gen_id }}');
        this.prevButton = this.querySelector('.ai-member-wins-prev-{{ ai_gen_id }}');
        this.nextButton = this.querySelector('.ai-member-wins-next-{{ ai_gen_id }}');
        this.cards = this.querySelectorAll('.ai-member-wins-card-{{ ai_gen_id }}');

        if (!this.carousel || !this.prevButton || !this.nextButton) return;

        this.setupEventListeners();
        this.updateButtonStates();
        this.setupAutoplay();
      }

      setupEventListeners() {
        this.prevButton.addEventListener('click', () => this.scrollByCard('prev'));
        this.nextButton.addEventListener('click', () => this.scrollByCard('next'));
        this.carousel.addEventListener('scroll', () => this.updateButtonStates());
      }

      cardStep() {
        const cardWidth = this.cards.length > 0 ? this.cards[0].offsetWidth : this.carousel.clientWidth;
        return cardWidth + 16;
      }

      /** Scrolls the carousel container only — never the page. */
      scrollByCard(direction) {
        this.carousel.scrollBy({
          left: direction === 'prev' ? -this.cardStep() : this.cardStep(),
          behavior: 'smooth'
        });
      }

      autoplayAdvance() {
        const maxScroll = this.carousel.scrollWidth - this.carousel.clientWidth;
        if (this.carousel.scrollLeft >= maxScroll - 2) {
          this.carousel.scrollTo({ left: 0, behavior: 'smooth' });
          return;
        }
        this.scrollByCard('next');
      }

      updateButtonStates() {
        const isAtStart = this.carousel.scrollLeft <= 0;
        const isAtEnd = this.carousel.scrollLeft + this.carousel.offsetWidth >= this.carousel.scrollWidth - 1;

        this.prevButton.disabled = isAtStart;
        this.nextButton.disabled = isAtEnd;
      }
${AUTOPLAY_MIXIN}    }

    customElements.define('member-wins-carousel-{{ ai_gen_id }}', MemberWinsCarousel{{ ai_gen_id }});
  })();
</script>`

const TARGETS = [
  {
    key: 'blocks/ai_gen_block_52353f6.liquid',
    role: 'fitness-gallery',
    script: FITNESS_SCRIPT,
    requires: ['data-gallery-main', 'data-thumb', 'data-arrow="prev"', 'data-slide='],
    expectDefine: "customElements.define('fitness-gallery-",
  },
  {
    key: 'blocks/ai_gen_block_cd3c949.liquid',
    role: 'client-results',
    script: CLIENT_RESULTS_SCRIPT,
    requires: ['data-gallery', 'data-card', 'data-nav="next"'],
    expectDefine: "customElements.define('client-results-",
  },
  {
    key: 'blocks/ai_gen_block_a7d1b3c.liquid',
    role: 'member-wins',
    script: MEMBER_WINS_SCRIPT,
    requires: ['ai-member-wins-carousel-', 'ai-member-wins-prev-', 'ai-member-wins-next-'],
    expectDefine: "customElements.define('member-wins-carousel-",
  },
]

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  return (await res.json()).themes
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status} ${await res.text()}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) }
}

/** Liquid tags are stripped so the JS can be parse-checked. */
function toPlainJs(script) {
  return script
    .replace(/^<script>/, '')
    .replace(/<\/script>$/, '')
    .replace(/\{%-?[\s\S]*?-?%\}/g, '')
    .replace(/\{\{\s*ai_gen_id\s*\}\}/g, 'x1')
}

function validateScript(role, script) {
  const js = toPlainJs(script)
  let curly = 0
  let paren = 0
  for (const ch of js) {
    if (ch === '{') curly += 1
    else if (ch === '}') curly -= 1
    else if (ch === '(') paren += 1
    else if (ch === ')') paren -= 1
  }
  let parse = { ok: true }
  try {
    // eslint-disable-next-line no-new-func
    new Function(js)
  } catch (err) {
    parse = { ok: false, message: String(err && err.message) }
  }
  const forbidden = ['scrollIntoView', 'window.scrollTo', 'window.scrollBy', '.focus('].filter(
    (needle) => js.includes(needle)
  )
  return {
    role,
    curly,
    paren,
    parse,
    forbidden,
    ok: curly === 0 && paren === 0 && parse.ok && forbidden.length === 0,
  }
}

const themes = await listThemes()
const live = themes.find((t) => t.role === 'main')

const validations = TARGETS.map((t) => validateScript(t.role, t.script))
if (validations.some((v) => !v.ok)) {
  console.error(JSON.stringify({ aborted: 'script validation failed', validations }, null, 2))
  process.exit(1)
}

const results = []

for (const target of TARGETS) {
  const original = await getAsset(live.id, target.key)
  const missingMarkup = target.requires.filter((needle) => !original.includes(needle))
  if (missingMarkup.length > 0 || !original.includes('{% schema %}')) {
    results.push({ key: target.key, role: target.role, skipped: true, missingMarkup })
    continue
  }

  fs.writeFileSync(
    path.join(outDir, `tmp-prerestore-${path.basename(target.key)}`),
    original,
    'utf8'
  )

  // Drop any previously deployed version of this script so the deploy is idempotent.
  let next = original
  for (const marker of [MARKER, ...OLD_MARKERS]) {
    next = next.replace(
      new RegExp(`<script>\\s*\\{%-? ?comment -?%\\} ${marker}[\\s\\S]*?<\\/script>\\s*`, 'g'),
      ''
    )
  }

  const insertAt = next.indexOf('{% schema %}')
  next = `${next.slice(0, insertAt).replace(/\s*$/, '\n\n')}${target.script}\n\n${next.slice(insertAt)}`

  const put = await putAsset(live.id, target.key, next)
  const after = put.ok ? await getAsset(live.id, target.key) : ''

  results.push({
    key: target.key,
    role: target.role,
    put: { ok: put.ok, status: put.status },
    putError: put.ok ? undefined : put.body,
    afterHasDefine: after.includes(target.expectDefine),
    afterHasMarker: after.includes(MARKER),
    afterScriptCount: (after.match(/<script>/g) || []).length,
    afterHasScrollIntoView: after.includes('scrollIntoView'),
    afterHasAutoplay: after.includes('setupAutoplay'),
    bytesAfter: after.length,
  })
}

console.log(
  JSON.stringify({ theme: { id: live.id, name: live.name }, validations, results }, null, 2)
)
