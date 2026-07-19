'use client'

/**
 * Small two-tone chime via Web Audio — no audio asset needed.
 * Browsers block audio until the user has interacted with the page, so we
 * unlock the AudioContext on the first pointer/key event and silently skip
 * playback before that.
 */

let audioContext: AudioContext | null = null
let unlocked = false
let unlockListenersAttached = false
let lastPlayedAt = 0

/** Minimum gap between chimes so overlapping polls don't stack sounds. */
const MIN_INTERVAL_MS = 1500

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

function attachUnlockListeners(): void {
  if (unlockListenersAttached || typeof window === 'undefined') return
  unlockListenersAttached = true

  const unlock = () => {
    const ctx = getContext()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
    unlocked = true
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }

  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock, { passive: true })
}

/** Call once from components that may play sounds, e.g. in a mount effect. */
export function prepareNotificationSound(): void {
  attachUnlockListeners()
}

function tone(ctx: AudioContext, frequency: number, startAt: number, duration: number, peak: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, startAt)
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.05)
}

/** Play the notification chime. Safe to call often — throttled and no-ops when audio is unavailable. */
export function playNotificationSound(): void {
  try {
    attachUnlockListeners()
    if (!unlocked) return
    const now = Date.now()
    if (now - lastPlayedAt < MIN_INTERVAL_MS) return

    const ctx = getContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume()
      if (ctx.state === 'suspended') return
    }

    lastPlayedAt = now
    const t = ctx.currentTime
    tone(ctx, 880, t, 0.18, 0.12)
    tone(ctx, 1174.66, t + 0.12, 0.22, 0.1)
  } catch {
    // Audio is best-effort — never break the UI over a chime.
  }
}
