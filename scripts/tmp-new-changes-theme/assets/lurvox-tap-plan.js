/*! lurvox-tap-plan v1 */
(function () {
  function hideCtas() {
    document
      .querySelectorAll('[data-cta-button],[class*="ai-transformation-plan-cta-wrapper"]')
      .forEach(function (el) {
        el.style.setProperty('display', 'none', 'important')
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
    hideCtas()
    wireCards()
  }
  run()
  document.addEventListener('DOMContentLoaded', run)
  setTimeout(run, 300)
  setTimeout(run, 1200)
})()
