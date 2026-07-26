(function () {
  'use strict'

  if (window.location.pathname.replace(/\/+$/, '') !== '/pages/talk-to-a-coach') return

  var API_URL = 'https://app.lurvox.in/api/consultation-requests'
  var COUNT_KEY = 'lurvox-consultation-submissions-v1'
  var PENDING_KEY = 'lurvox-consultation-pending-v1'
  var MAX_SUBMISSIONS = 2

  function readCount() {
    try {
      var value = Number(window.localStorage.getItem(COUNT_KEY))
      return Number.isFinite(value) ? Math.max(0, Math.min(MAX_SUBMISSIONS, value)) : 0
    } catch (_error) {
      return 0
    }
  }

  function writeCount(value) {
    try {
      window.localStorage.setItem(COUNT_KEY, String(value))
    } catch (_error) {}
  }

  function idempotencyKey() {
    try {
      var pending = window.sessionStorage.getItem(PENDING_KEY)
      if (pending) return pending
      var key =
        window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (digit) {
              return (
                Number(digit) ^
                (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))
              ).toString(16)
            })
      window.sessionStorage.setItem(PENDING_KEY, key)
      return key
    } catch (_error) {
      return ''
    }
  }

  function clearPending() {
    try {
      window.sessionStorage.removeItem(PENDING_KEY)
    } catch (_error) {}
  }

  function field(form, selectors) {
    for (var index = 0; index < selectors.length; index += 1) {
      var match = form.querySelector(selectors[index])
      if (match) return match
    }
    return null
  }

  function install() {
    var form = document.querySelector('form[action*="/contact"]')
    if (!form || form.dataset.lurvoxConsultationLimit === 'installed') return
    form.dataset.lurvoxConsultationLimit = 'installed'

    var nameInput = field(form, ['[name="contact[name]"]', 'input[name*="[name]"]'])
    var emailInput = field(form, [
      '[name="contact[email]"]',
      'input[type="email"]',
      'input[name*="[email]"]',
    ])
    var phoneInput = field(form, [
      '[name="contact[phone]"]',
      'input[type="tel"]',
      'input[name*="[phone]"]',
    ])
    var submitButton = form.querySelector('[type="submit"]')

    if (!nameInput || !emailInput || !phoneInput || !submitButton) return
    nameInput.required = true
    emailInput.required = true
    phoneInput.required = true

    var status = document.createElement('div')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.style.cssText =
      'margin:0 0 18px;padding:12px 14px;border:1px solid rgba(255,98,0,.35);border-radius:10px;line-height:1.5;'
    form.parentNode.insertBefore(status, form)

    function showAvailable(used) {
      var remaining = MAX_SUBMISSIONS - used
      status.textContent =
        remaining === 1
          ? 'You have one Talk to a coach submission remaining.'
          : 'You can submit this form up to two times.'
    }

    function showExhausted(message) {
      status.textContent =
        message ||
        'You have used both Talk to a coach submissions. Please use WhatsApp for further help.'
      form.hidden = true
      form.style.display = 'none'
      form.setAttribute('aria-hidden', 'true')
    }

    var storedCount = readCount()
    if (storedCount >= MAX_SUBMISSIONS) {
      showExhausted()
      return
    }
    showAvailable(storedCount)

    form.addEventListener('submit', function (event) {
      if (form.dataset.lurvoxConsultationApproved === 'true') return
      event.preventDefault()

      if (!form.reportValidity()) return
      if (form.dataset.lurvoxConsultationBusy === 'true') return

      var key = idempotencyKey()
      if (!key) {
        status.textContent = 'Please refresh this page and try again.'
        return
      }

      form.dataset.lurvoxConsultationBusy = 'true'
      submitButton.disabled = true
      status.textContent = 'Submitting your details...'

      window
        .fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameInput.value,
            email: emailInput.value,
            phone: phoneInput.value,
            idempotencyKey: key,
          }),
        })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {}
            })
            .then(function (body) {
              return { response: response, body: body }
            })
        })
        .then(function (result) {
          if (
            result.response.status === 429 &&
            result.body.code === 'CONSULTATION_REQUEST_LIMIT'
          ) {
            writeCount(MAX_SUBMISSIONS)
            clearPending()
            showExhausted(result.body.error)
            return
          }
          if (!result.response.ok) {
            throw new Error(result.body.error || 'Could not submit your details. Please retry.')
          }

          writeCount(Number(result.body.used) || storedCount + 1)
          clearPending()
          form.dataset.lurvoxConsultationApproved = 'true'
          form.requestSubmit()
        })
        .catch(function (error) {
          status.textContent =
            error && error.message
              ? error.message
              : 'Could not submit your details. Please retry.'
          form.dataset.lurvoxConsultationBusy = 'false'
          submitButton.disabled = false
        })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install)
  } else {
    install()
  }
  document.addEventListener('shopify:section:load', install)
})()
