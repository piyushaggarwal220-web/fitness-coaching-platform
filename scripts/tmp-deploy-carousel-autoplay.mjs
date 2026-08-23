/**
 * Add autoplay + pause-on-interaction to client photo testimonial carousels
 * on MAIN theme (LURVOX Sale Focus).
 *
 * Targets:
 *  - blocks/ai_gen_block_52353f6.liquid  (Fitness gallery)
 *  - blocks/ai_gen_block_a7d1b3c.liquid  (Member wins)
 *  - blocks/ai_gen_block_cd3c949.liquid  (Client results)
 *  - blocks/ai_gen_block_3cbb200.liquid  (older Client results — patched if present)
 *
 * Auth: %TEMP%/shopify-auth-token.json
 * Store: 9uwyq1-0j.myshopify.com
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'
const AUTO_MS = 3500
const RESUME_MS = 2500

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'tmp-live-theme-meta.json'), 'utf8'))

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

/** Shared autoplay helpers injected into each custom element class. */
function autoplayHelpers(advanceCall) {
  return `
      setupAutoplay() {
        this._autoplayMs = ${AUTO_MS};
        this._resumeMs = ${RESUME_MS};
        this._autoTimer = null;
        this._resumeTimer = null;
        this._pausedByUser = false;

        const pause = () => this.pauseAutoplay();
        const scheduleResume = () => this.scheduleResumeAutoplay();

        this.addEventListener('pointerdown', pause);
        this.addEventListener('touchstart', pause, { passive: true });
        this.addEventListener('mousedown', pause);
        this.addEventListener('pointerup', scheduleResume);
        this.addEventListener('touchend', scheduleResume);
        this.addEventListener('mouseup', scheduleResume);
        this.addEventListener('mouseleave', scheduleResume);
        this.addEventListener('pointerleave', scheduleResume);

        this.startAutoplay();
      }

      startAutoplay() {
        this.stopAutoplay();
        if (this._pausedByUser) return;
        this._autoTimer = setInterval(() => {
          ${advanceCall}
        }, this._autoplayMs);
      }

      stopAutoplay() {
        if (this._autoTimer) {
          clearInterval(this._autoTimer);
          this._autoTimer = null;
        }
      }

      pauseAutoplay() {
        this._pausedByUser = true;
        this.stopAutoplay();
        if (this._resumeTimer) {
          clearTimeout(this._resumeTimer);
          this._resumeTimer = null;
        }
      }

      scheduleResumeAutoplay() {
        if (this._resumeTimer) clearTimeout(this._resumeTimer);
        this._resumeTimer = setTimeout(() => {
          this._pausedByUser = false;
          this._resumeTimer = null;
          this.startAutoplay();
        }, this._resumeMs);
      }

      disconnectedCallback() {
        this.stopAutoplay();
        if (this._resumeTimer) clearTimeout(this._resumeTimer);
      }
`
}

function patchFitnessGallery(src) {
  if (src.includes('setupAutoplay()')) return { content: src, skipped: true }

  const oldScript = `  (function() {
    class FitnessGallery{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
        this.currentIndex = 0;
        this.totalSlides = this.querySelectorAll('[data-slide]').length || 1;
      }

      connectedCallback() {
        this.galleryMain = this.querySelector('[data-gallery-main]');
        this.thumbs = this.querySelectorAll('[data-thumb]');
        this.prevArrow = this.querySelector('[data-arrow="prev"]');
        this.nextArrow = this.querySelector('[data-arrow="next"]');

        this.setupEventListeners();
        this.setupScrollSnap();
      }

      setupEventListeners() {
        this.thumbs.forEach((thumb, index) => {
          thumb.addEventListener('click', () => {
            this.scrollToSlide(index);
          });
        });

        this.prevArrow.addEventListener('click', () => {
          this.scrollToSlide(this.currentIndex - 1);
        });

        this.nextArrow.addEventListener('click', () => {
          this.scrollToSlide(this.currentIndex + 1);
        });

        this.galleryMain.addEventListener('scroll', () => {
          this.updateActiveThumb();
        });
      }

      setupScrollSnap() {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const slideIndex = parseInt(entry.target.dataset.slide) - 1;
                this.currentIndex = slideIndex;
                this.updateActiveThumb();
              }
            });
          },
          {
            root: this.galleryMain,
            threshold: 0.5
          }
        );

        this.querySelectorAll('[data-slide]').forEach((slide) => {
          observer.observe(slide);
        });
      }

      scrollToSlide(index) {
        if (index < 0) index = 0;
        if (index >= this.totalSlides) index = this.totalSlides - 1;

        const slide = this.querySelector(\`[data-slide="\${index + 1}"]\`);
        if (slide) {
          slide.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
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
    }

    customElements.define('fitness-gallery-{{ ai_gen_id }}', FitnessGallery{{ ai_gen_id }});
  })();`

  const newScript = `  (function() {
    class FitnessGallery{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
        this.currentIndex = 0;
        this.totalSlides = this.querySelectorAll('[data-slide]').length || 1;
      }

      connectedCallback() {
        this.galleryMain = this.querySelector('[data-gallery-main]');
        this.thumbs = this.querySelectorAll('[data-thumb]');
        this.prevArrow = this.querySelector('[data-arrow="prev"]');
        this.nextArrow = this.querySelector('[data-arrow="next"]');

        this.setupEventListeners();
        this.setupScrollSnap();
        if (this.totalSlides > 1) this.setupAutoplay();
      }

      setupEventListeners() {
        this.thumbs.forEach((thumb, index) => {
          thumb.addEventListener('click', () => {
            this.pauseAutoplay();
            this.scrollToSlide(index);
            this.scheduleResumeAutoplay();
          });
        });

        this.prevArrow.addEventListener('click', () => {
          this.pauseAutoplay();
          this.scrollToSlide(this.currentIndex - 1);
          this.scheduleResumeAutoplay();
        });

        this.nextArrow.addEventListener('click', () => {
          this.pauseAutoplay();
          this.scrollToSlide(this.currentIndex + 1);
          this.scheduleResumeAutoplay();
        });

        this.galleryMain.addEventListener('scroll', () => {
          this.updateActiveThumb();
        });
      }

      setupScrollSnap() {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const slideIndex = parseInt(entry.target.dataset.slide) - 1;
                this.currentIndex = slideIndex;
                this.updateActiveThumb();
              }
            });
          },
          {
            root: this.galleryMain,
            threshold: 0.5
          }
        );

        this.querySelectorAll('[data-slide]').forEach((slide) => {
          observer.observe(slide);
        });
      }

      scrollToSlide(index) {
        if (this.totalSlides <= 0) return;
        if (index < 0) index = this.totalSlides - 1;
        if (index >= this.totalSlides) index = 0;

        const slide = this.querySelector(\`[data-slide="\${index + 1}"]\`);
        if (slide) {
          slide.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }

      autoAdvance() {
        this.scrollToSlide(this.currentIndex + 1);
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
${autoplayHelpers('this.autoAdvance();')}
    }

    customElements.define('fitness-gallery-{{ ai_gen_id }}', FitnessGallery{{ ai_gen_id }});
  })();`

  if (!src.includes(oldScript)) {
    throw new Error('Fitness gallery script block not found (unexpected live content)')
  }
  return { content: src.replace(oldScript, newScript), skipped: false }
}

function patchMemberWins(src) {
  if (src.includes('setupAutoplay()')) return { content: src, skipped: true }

  const oldScript = `  (function() {
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
      }

      setupEventListeners() {
        this.prevButton.addEventListener('click', () => this.scroll('prev'));
        this.nextButton.addEventListener('click', () => this.scroll('next'));
        this.carousel.addEventListener('scroll', () => this.updateButtonStates());
      }

      scroll(direction) {
        const cardWidth = this.cards[0].offsetWidth;
        const gap = 16;
        const scrollAmount = cardWidth + gap;

        if (direction === 'prev') {
          this.carousel.scrollLeft -= scrollAmount;
        } else {
          this.carousel.scrollLeft += scrollAmount;
        }
      }

      updateButtonStates() {
        const isAtStart = this.carousel.scrollLeft <= 0;
        const isAtEnd = this.carousel.scrollLeft + this.carousel.offsetWidth >= this.carousel.scrollWidth - 1;

        this.prevButton.disabled = isAtStart;
        this.nextButton.disabled = isAtEnd;
      }
    }

    customElements.define('member-wins-carousel-{{ ai_gen_id }}', MemberWinsCarousel{{ ai_gen_id }});
  })();`

  const newScript = `  (function() {
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
        if (this.cards.length > 1) this.setupAutoplay();
      }

      setupEventListeners() {
        this.prevButton.addEventListener('click', () => {
          this.pauseAutoplay();
          this.scroll('prev');
          this.scheduleResumeAutoplay();
        });
        this.nextButton.addEventListener('click', () => {
          this.pauseAutoplay();
          this.scroll('next');
          this.scheduleResumeAutoplay();
        });
        this.carousel.addEventListener('scroll', () => this.updateButtonStates());
      }

      scroll(direction) {
        if (!this.cards.length) return;
        const cardWidth = this.cards[0].offsetWidth;
        const gap = 16;
        const scrollAmount = cardWidth + gap;
        const maxScroll = this.carousel.scrollWidth - this.carousel.offsetWidth;

        if (direction === 'prev') {
          if (this.carousel.scrollLeft <= 1) {
            this.carousel.scrollTo({ left: maxScroll, behavior: 'smooth' });
          } else {
            this.carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
          }
        } else {
          if (this.carousel.scrollLeft + this.carousel.offsetWidth >= this.carousel.scrollWidth - 2) {
            this.carousel.scrollTo({ left: 0, behavior: 'smooth' });
          } else {
            this.carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
          }
        }
      }

      autoAdvance() {
        this.scroll('next');
      }

      updateButtonStates() {
        const isAtStart = this.carousel.scrollLeft <= 0;
        const isAtEnd = this.carousel.scrollLeft + this.carousel.offsetWidth >= this.carousel.scrollWidth - 1;

        this.prevButton.disabled = isAtStart;
        this.nextButton.disabled = isAtEnd;
      }
${autoplayHelpers('this.autoAdvance();')}
    }

    customElements.define('member-wins-carousel-{{ ai_gen_id }}', MemberWinsCarousel{{ ai_gen_id }});
  })();`

  if (!src.includes(oldScript)) {
    throw new Error('Member wins script block not found (unexpected live content)')
  }
  return { content: src.replace(oldScript, newScript), skipped: false }
}

function patchClientResults(src) {
  if (src.includes('setupAutoplay()')) return { content: src, skipped: true }

  const oldScript = `  (function() {
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
            const direction = button.dataset.nav;
            this.navigate(direction);
          });
        });
      }

      navigate(direction) {
        const activeCard = this.querySelector('[data-card].active');
        if (!activeCard) return;

        const currentIndex = Array.from(this.cards).indexOf(activeCard);
        let nextIndex;

        if (direction === 'next') {
          nextIndex = currentIndex + 1 >= this.cards.length ? 0 : currentIndex + 1;
        } else {
          nextIndex = currentIndex - 1 < 0 ? this.cards.length - 1 : currentIndex - 1;
        }

        const nextCard = this.cards[nextIndex];
        if (nextCard) {
          nextCard.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }
    }

    customElements.define('client-results-{{ ai_gen_id }}', ClientResults{{ ai_gen_id }});
  })();`

  const newScript = `  (function() {
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
        if (this.cards.length > 1) this.setupAutoplay();
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
            this.pauseAutoplay();
            const direction = button.dataset.nav;
            this.navigate(direction);
            this.scheduleResumeAutoplay();
          });
        });
      }

      navigate(direction) {
        const activeCard = this.querySelector('[data-card].active');
        if (!activeCard) return;

        const currentIndex = Array.from(this.cards).indexOf(activeCard);
        let nextIndex;

        if (direction === 'next') {
          nextIndex = currentIndex + 1 >= this.cards.length ? 0 : currentIndex + 1;
        } else {
          nextIndex = currentIndex - 1 < 0 ? this.cards.length - 1 : currentIndex - 1;
        }

        const nextCard = this.cards[nextIndex];
        if (nextCard) {
          nextCard.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }

      autoAdvance() {
        this.navigate('next');
      }
${autoplayHelpers('this.autoAdvance();')}
    }

    customElements.define('client-results-{{ ai_gen_id }}', ClientResults{{ ai_gen_id }});
  })();`

  if (!src.includes(oldScript)) {
    throw new Error('Client results (cd3c949) script block not found (unexpected live content)')
  }
  return { content: src.replace(oldScript, newScript), skipped: false }
}

function patchOlderClientResults(src) {
  if (src.includes('setupAutoplay()')) return { content: src, skipped: true }

  const oldScript = `  (function() {
    class ClientResults{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.scrollContainer = this.querySelector('[data-scroll-container]');
        this.cards = this.querySelectorAll('[data-card]');
        
        if (!this.scrollContainer || this.cards.length === 0) return;

        this.setupScrollObserver();
        this.updateActiveCard();
      }

      setupScrollObserver() {
        this.scrollContainer.addEventListener('scroll', () => {
          this.updateActiveCard();
        });
      }

      updateActiveCard() {
        const containerRect = this.scrollContainer.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;

        let closestCard = null;
        let closestDistance = Infinity;

        this.cards.forEach((card) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(containerCenter - cardCenter);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
          }
        });

        this.cards.forEach((card) => {
          card.classList.remove('active');
        });

        if (closestCard) {
          closestCard.classList.add('active');
        }
      }
    }

    customElements.define('client-results-{{ ai_gen_id }}', ClientResults{{ ai_gen_id }});
  })();`

  const newScript = `  (function() {
    class ClientResults{{ ai_gen_id }} extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.scrollContainer = this.querySelector('[data-scroll-container]');
        this.cards = this.querySelectorAll('[data-card]');
        
        if (!this.scrollContainer || this.cards.length === 0) return;

        this.setupScrollObserver();
        this.updateActiveCard();
        if (this.cards.length > 1) this.setupAutoplay();
      }

      setupScrollObserver() {
        this.scrollContainer.addEventListener('scroll', () => {
          this.updateActiveCard();
        });
      }

      updateActiveCard() {
        const containerRect = this.scrollContainer.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;

        let closestCard = null;
        let closestDistance = Infinity;

        this.cards.forEach((card) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(containerCenter - cardCenter);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
          }
        });

        this.cards.forEach((card) => {
          card.classList.remove('active');
        });

        if (closestCard) {
          closestCard.classList.add('active');
        }
      }

      autoAdvance() {
        const active = this.querySelector('[data-card].active');
        const list = Array.from(this.cards);
        if (!list.length) return;
        const currentIndex = active ? list.indexOf(active) : 0;
        const nextIndex = (currentIndex + 1) % list.length;
        const nextCard = list[nextIndex];
        if (nextCard) {
          nextCard.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }
${autoplayHelpers('this.autoAdvance();')}
    }

    customElements.define('client-results-{{ ai_gen_id }}', ClientResults{{ ai_gen_id }});
  })();`

  if (!src.includes(oldScript)) {
    throw new Error('Older client results (3cbb200) script block not found (unexpected live content)')
  }
  return { content: src.replace(oldScript, newScript), skipped: false }
}

const files = {
  'blocks/ai_gen_block_52353f6.liquid': {
    srcPath: path.join(outDir, 'tmp-live-ai_gen_block_52353f6.liquid'),
    patch: patchFitnessGallery,
    outPath: path.join(outDir, 'tmp-autoplay-ai_gen_block_52353f6.liquid'),
  },
  'blocks/ai_gen_block_a7d1b3c.liquid': {
    srcPath: path.join(outDir, 'tmp-live-ai_gen_block_a7d1b3c.liquid'),
    patch: patchMemberWins,
    outPath: path.join(outDir, 'tmp-autoplay-ai_gen_block_a7d1b3c.liquid'),
  },
  'blocks/ai_gen_block_cd3c949.liquid': {
    srcPath: path.join(outDir, 'tmp-live-ai_gen_block_cd3c949.liquid'),
    patch: patchClientResults,
    outPath: path.join(outDir, 'tmp-autoplay-ai_gen_block_cd3c949.liquid'),
  },
  'blocks/ai_gen_block_3cbb200.liquid': {
    srcPath: path.join(outDir, 'tmp-live-ai_gen_block_3cbb200.liquid'),
    patch: patchOlderClientResults,
    outPath: path.join(outDir, 'tmp-autoplay-ai_gen_block_3cbb200.liquid'),
  },
}

const upsertFiles = []
const report = []

for (const [filename, meta] of Object.entries(files)) {
  if (!fs.existsSync(meta.srcPath)) {
    report.push({ filename, status: 'missing_local_fetch' })
    continue
  }
  const src = fs.readFileSync(meta.srcPath, 'utf8')
  const { content, skipped } = meta.patch(src)
  fs.writeFileSync(meta.outPath, content)
  if (skipped) {
    report.push({ filename, status: 'already_patched' })
  } else {
    report.push({
      filename,
      status: 'patched',
      bytes: content.length,
      hasSetupAutoplay: content.includes('setupAutoplay()'),
      hasSetInterval: content.includes('setInterval'),
    })
    upsertFiles.push({
      filename,
      body: { type: 'TEXT', value: content },
    })
  }
}

if (!upsertFiles.length) {
  console.log(JSON.stringify({ ok: true, note: 'nothing to upsert', report }, null, 2))
  process.exit(0)
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: live.id, files: upsertFiles }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log(
  JSON.stringify(
    {
      ok: true,
      theme: live,
      autoMs: AUTO_MS,
      resumeMs: RESUME_MS,
      upserted: upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename),
      report,
      note: '3cbb200 not on homepage index but patched for consistency',
    },
    null,
    2
  )
)
