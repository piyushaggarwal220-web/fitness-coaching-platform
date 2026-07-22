'use client'

/** Shared PWA install helpers */

export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed-at'
export const PWA_INSTALL_DISMISS_MS = 24 * 60 * 60 * 1000

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function wasInstallDismissedToday(): boolean {
  try {
    const raw = window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < PWA_INSTALL_DISMISS_MS
  } catch {
    return false
  }
}

export function markInstallDismissedToday() {
  try {
    window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  return iOS || iPadOs
}

export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android/i.test(window.navigator.userAgent)
}

export function manualInstallCopy(): string {
  if (isIosDevice()) {
    return 'Tap Share, then Add to Home Screen.'
  }
  if (isAndroidDevice()) {
    return 'Chrome menu (⋮) → Install app or Add to Home screen.'
  }
  return 'Chrome address bar install icon, or Menu → Cast, save, and share → Install page as app.'
}

declare global {
  interface Window {
    __lurvoxDeferredInstall?: BeforeInstallPromptEvent | null
  }
}

/** Capture the native install event as early as possible (layout mount). */
export function bindInstallPromptCapture() {
  if (typeof window === 'undefined') return () => {}
  const onPrompt = (event: Event) => {
    event.preventDefault()
    window.__lurvoxDeferredInstall = event as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('lurvox-install-available'))
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  return () => window.removeEventListener('beforeinstallprompt', onPrompt)
}

export function getDeferredInstall(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  return window.__lurvoxDeferredInstall ?? null
}

export async function triggerNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const deferred = getDeferredInstall()
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const choice = await deferred.userChoice
  window.__lurvoxDeferredInstall = null
  return choice.outcome
}
