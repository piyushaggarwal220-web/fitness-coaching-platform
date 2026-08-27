/**
 * Safari "Request Desktop Website" (global or per-site) reports a Macintosh UA
 * and a ~980px layout viewport on iPhone. The app then paints the 800px "wide"
 * chrome instead of the phone shell.
 *
 * Forcing a phone CSS width restores the intended layout. Real iPads stay wide.
 */

const PHONE_CSS_WIDTH = 390
const PHONE_LAYOUT_MAX = 480

function shortestScreen(): number {
  return Math.min(window.screen.width || 0, window.screen.height || 0)
}

function longestScreen(): number {
  return Math.max(window.screen.width || 0, window.screen.height || 0)
}

/** iPhone / iPod, including desktop-mode UA spoofing as Macintosh. */
export function isIosPhone(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return true
  if (/iPad/.test(ua)) return false
  const touchMac =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  if (!touchMac) return false
  const short = shortestScreen()
  const long = longestScreen()
  if (short === 0) return window.innerWidth <= PHONE_LAYOUT_MAX
  // Phones stay taller than ~3:2 even when Safari lies about pixel size.
  return long / short >= 1.55
}

export function shouldLockPhoneViewport(): boolean {
  if (!isIosPhone()) return false
  return window.innerWidth > PHONE_LAYOUT_MAX
}

const PHONE_VIEWPORT_CONTENT = `width=${PHONE_CSS_WIDTH}, initial-scale=1, maximum-scale=5, viewport-fit=cover`

export function applyPhoneViewportLock(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (!shouldLockPhoneViewport()) return

  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    document.head.appendChild(meta)
  }
  if (meta.getAttribute('content') !== PHONE_VIEWPORT_CONTENT) {
    meta.setAttribute('content', PHONE_VIEWPORT_CONTENT)
  }
  document.documentElement.classList.add('lx-phone-viewport')
}

/** Inline <head> script so the lock runs before first paint. */
export const PHONE_VIEWPORT_BOOTSTRAP = `(function(){try{var n=navigator,ua=n.userAgent||'',iphone=/iPhone|iPod/.test(ua),ipad=/iPad/.test(ua),touchMac=n.platform==='MacIntel'&&n.maxTouchPoints>1,w=screen.width||0,h=screen.height||0,short=Math.min(w,h),long=Math.max(w,h),phone=iphone||(!ipad&&touchMac&&(short===0||long/short>=1.55));if(!phone||innerWidth<=480)return;var m=document.querySelector('meta[name="viewport"]');if(!m){m=document.createElement('meta');m.setAttribute('name','viewport');document.head.appendChild(m);}m.setAttribute('content','width=390, initial-scale=1, maximum-scale=5, viewport-fit=cover');document.documentElement.classList.add('lx-phone-viewport');}catch(e){}})();`
