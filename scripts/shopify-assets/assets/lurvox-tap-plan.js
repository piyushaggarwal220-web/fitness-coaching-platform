/*! lurvox-tap-plan v2 — wire plan cards; only hide retired trial CTAs */
(function () {
  function fixTrialCtas() {
    document.querySelectorAll('a[data-cta-button]').forEach(function (el) {
      var href = el.getAttribute('href') || ''
      if (/trial|1_week|1_month|1-month/i.test(href)) {
        el.style.setProperty('display', 'none', 'important')
      } else {
        el.style.removeProperty('display')
      }
    })
  }

  function wireCards() {
    document
      .querySelectorAll('[class*="ai-transformation-plan-card-"][data-plan-link]')
      .forEach(function (card) {
        if (card.dataset.lurvoxTapWired === '1') return
        card.dataset.lurvoxTapWired = '1'
        card.style.cursor = 'pointer'
        card.addEventListener(
          'click',
          function (e) {
            var link = card.getAttribute('data-plan-link')
            if (!link) return
            e.preventDefault()
            e.stopPropagation()
            window.location.href = link
          },
          true
        )
      })
  }

  function run() {
    fixTrialCtas()
    wireCards()
  }

  run()
  document.addEventListener('DOMContentLoaded', run)
  setTimeout(run, 300)
  setTimeout(run, 1200)
})()
