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

/*! lurvox-home-coach-form v1 — homepage talk form goes to LURVOX, not /contact 404 */
(function () {
  if (window.__lurvoxHomeCoachForm) return;
  window.__lurvoxHomeCoachForm = true;
  var API = 'https://app.lurvox.in/api/public/talk-to-a-coach';
  var MESSAGE = 'Homepage request: please call me about LURVOX coaching.';

  function field(form, keys) {
    for (var i = 0; i < keys.length; i++) {
      var el = form.querySelector('[name="' + keys[i] + '"]');
      if (el && String(el.value || '').trim()) return String(el.value).trim();
    }
    return '';
  }

  function statusEl(form) {
    var el = form.querySelector('[data-lx-coach-status]');
    if (el) return el;
    el = document.createElement('p');
    el.setAttribute('data-lx-coach-status', '1');
    el.setAttribute('role', 'status');
    el.style.margin = '10px 0 0';
    el.style.fontSize = '14px';
    form.appendChild(el);
    return el;
  }

  function reveal(form) {
    var wrap = form.closest('.shopify-block') || form.closest('.contact-form') || form;
    ;[wrap, form].forEach(function (el) {
      if (!el || !el.style) return;
      el.style.removeProperty('display');
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
    });
  }

  function bind(form) {
    reveal(form);
    if (form.dataset.lxCoachBound === '1') return;
    form.dataset.lxCoachBound = '1';
    form.addEventListener(
      'submit',
      function (event) {
        event.preventDefault();
        event.stopPropagation();
        var name = field(form, ['contact[name]', 'name']);
        var email = field(form, ['contact[email]', 'email']);
        var phone = field(form, ['contact[phone]', 'phone']);
        var status = statusEl(form);
        var btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (!name || name.length < 2) {
          status.textContent = 'Please enter your name.';
          return;
        }
        if (!phone || phone.replace(/\D/g, '').length < 10) {
          status.textContent = 'Please enter a valid WhatsApp number.';
          return;
        }
        status.textContent = 'Sending…';
        if (btn) btn.disabled = true;
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, email: email, phone: phone, message: MESSAGE }),
        })
          .then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
              return { ok: res.ok && data && data.ok, error: data && data.error };
            });
          })
          .then(function (result) {
            if (!result.ok) {
              status.textContent = result.error || 'Could not send. Please try again.';
              if (btn) btn.disabled = false;
              return;
            }
            status.textContent = 'Got it. A coach will call you.';
            form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]').forEach(function (input) {
              input.disabled = true;
            });
          })
          .catch(function () {
            status.textContent = 'Network error. Please try again.';
            if (btn) btn.disabled = false;
          });
      },
      true
    );
  }

  function scan() {
    document.querySelectorAll('form[action*="/contact"]').forEach(bind);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  setTimeout(scan, 800);
  setTimeout(scan, 2000);
})();
