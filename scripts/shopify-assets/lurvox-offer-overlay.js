/* lx-carousel-swipe-v3 */
(function () {
  if (document.getElementById('lx-carousel-swipe-v3')) return;
  var s = document.createElement('style');
  s.id = 'lx-carousel-swipe-v3';
  s.textContent =
    '[data-gallery-main]{overflow:auto hidden!important;scroll-snap-type:x mandatory!important;touch-action:pan-x pan-y!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain;}[data-gallery-main] [data-slide],[data-gallery-main] img{-webkit-user-drag:none;user-select:none;pointer-events:none;}';
  (document.body || document.documentElement).appendChild(s);
})();

/* lx-quiz-url-v3 */
(function () {
  try {
    var path = (location.pathname || '').replace(/\/$/, '') || '/';
    if (path === '/pages/find-your-plan') {
      location.replace('/pages/choose-your-plan');
      return;
    }
    if (path === '/pages/build-your-package') {
      location.replace('/pages/pick-your-plan');
      return;
    }
    function rewrite() {
      document.querySelectorAll('a[href*="/pages/find-your-plan"]').forEach(function (a) {
        a.setAttribute(
          'href',
          String(a.getAttribute('href') || '').replace('/pages/find-your-plan', '/pages/choose-your-plan')
        );
      });
      document.querySelectorAll('a[href*="/pages/build-your-package"]').forEach(function (a) {
        a.setAttribute(
          'href',
          String(a.getAttribute('href') || '').replace('/pages/build-your-package', '/pages/pick-your-plan')
        );
      });
      document.querySelectorAll('[data-cart-addons], .lx-cart__addons').forEach(function (el) {
        el.remove();
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rewrite);
    else rewrite();
  } catch (e) {}
})();

/*! lurvox-offer-overlay v7 — no fake 60% OFF banners */
(function () {
  if (window.__lurvoxOfferOverlayV7) return;
  window.__lurvoxOfferOverlayV7 = true;
  if (!/lurvox\.in|myshopify\.com/i.test(location.host)) return;

  var beige = document.getElementById('lurvox-offer-beige-force');
  if (beige) beige.remove();
  var old = document.getElementById('lurvox-offer-overlay-css');
  if (old) old.remove();

  function killLegacy() {
    document.querySelectorAll('#lurvox-offer-strip-live, .lurvox-offer-strip, [class*="offer-strip"]').forEach(function (el) {
      var t = el.textContent || '';
      if (/5%\s*OFF|SAVE5|15%\s*OFF|60%\s*OFF|SALE ENDS/i.test(t) && !el.classList.contains('lurvox-offer-strip--brand')) {
        el.remove();
      }
    });
  }
  killLegacy();
  setTimeout(killLegacy, 500);
})();
