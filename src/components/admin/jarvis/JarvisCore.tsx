'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { JarvisCoreState } from '@/lib/jarvis/operator-present'
import { j2 } from './styles'

const STATE_COLOR: Record<JarvisCoreState, string> = {
  IDLE: 'rgba(255, 98, 0, 0.55)',
  LISTENING: j2.amber,
  THINKING: 'rgba(251, 191, 36, 0.9)',
  OBSERVING: j2.cyan,
  RESEARCHING: 'rgba(167, 139, 250, 0.85)',
  PLANNING: 'rgba(251, 191, 36, 0.85)',
  CREATING: j2.amber,
  RENDERING: 'rgba(56, 189, 248, 0.95)',
  WAITING_FOR_APPROVAL: 'rgba(245, 158, 11, 0.95)',
  EXECUTING: 'rgba(52, 211, 153, 0.9)',
  VERIFYING: j2.cyan,
  LEARNING: 'rgba(167, 139, 250, 0.8)',
  COMPLETED: 'rgba(52, 211, 153, 0.8)',
  ERROR: 'rgba(248, 113, 113, 0.95)',
  PAUSED: 'rgba(161, 161, 170, 0.75)',
}

function animName(state: JarvisCoreState, reduced: boolean): string | undefined {
  if (reduced) return undefined
  switch (state) {
    case 'IDLE':
      return 'jarvis-breathe 3.6s ease-in-out infinite'
    case 'LISTENING':
      return 'jarvis-listen 1.4s ease-in-out infinite'
    case 'THINKING':
    case 'PLANNING':
      return 'jarvis-think 8s linear infinite'
    case 'OBSERVING':
    case 'VERIFYING':
      return 'jarvis-scan 4.5s ease-in-out infinite'
    case 'RESEARCHING':
    case 'LEARNING':
      return 'jarvis-particles 6s linear infinite'
    case 'CREATING':
    case 'EXECUTING':
      return 'jarvis-create 2.2s ease-in-out infinite'
    case 'RENDERING':
      return 'jarvis-render 2.8s ease-in-out infinite'
    case 'WAITING_FOR_APPROVAL':
      return 'jarvis-amber-hold 3s ease-in-out infinite'
    case 'COMPLETED':
      return 'jarvis-complete 1.2s ease-out 1'
    case 'ERROR':
      return 'jarvis-error 1.6s ease-in-out infinite'
    default:
      return 'jarvis-breathe 3.6s ease-in-out infinite'
  }
}

export function JarvisCore({
  state,
  headline,
  detail,
  size = 300,
}: {
  state: JarvisCoreState
  headline: string
  detail?: string
  size?: number
}) {
  const color = STATE_COLOR[state]
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const footprint = Math.max(200, Math.min(340, size))
  const anim = useMemo(() => animName(state, reduced), [state, reduced])

  const wrap: CSSProperties = {
    width: footprint,
    height: footprint,
    margin: '0 auto',
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
  }

  return (
    <div style={{ textAlign: 'center' }} role="status" aria-live="polite" aria-label={`Jarvis ${state}: ${headline}`}>
      <style>{CORE_CSS}</style>
      <div style={wrap}>
        {/* atmospheric glow */}
        <div
          className="jarvis-glow"
          style={{
            position: 'absolute',
            inset: '-18%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}33 0%, transparent 68%)`,
            filter: reduced ? 'none' : 'blur(8px)',
            animation: anim,
            pointerEvents: 'none',
          }}
        />
        {/* outer ring */}
        <div
          className="jarvis-ring"
          style={{
            position: 'absolute',
            inset: '4%',
            borderRadius: '50%',
            border: `1px solid ${color}55`,
            boxShadow: `0 0 40px ${color}22, inset 0 0 30px rgba(255,255,255,0.03)`,
            animation: state === 'THINKING' || state === 'PLANNING' ? (reduced ? undefined : 'jarvis-orbit 14s linear infinite') : undefined,
          }}
        />
        {/* mid energy field */}
        <div
          style={{
            position: 'absolute',
            inset: '18%',
            borderRadius: '50%',
            background: `conic-gradient(from 120deg, transparent, ${color}44, transparent 40%, ${color}22, transparent 75%)`,
            opacity: 0.75,
            animation: reduced ? undefined : 'jarvis-orbit 18s linear infinite reverse',
            filter: 'blur(1px)',
          }}
        />
        {/* particles / noise layer */}
        <div
          className="jarvis-noise"
          style={{
            position: 'absolute',
            inset: '22%',
            borderRadius: '50%',
            opacity: 0.35,
            backgroundImage:
              'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.5) 0, transparent 100%), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.4) 0, transparent 100%), radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.35) 0, transparent 100%), radial-gradient(1px 1px at 85% 25%, rgba(255,255,255,0.3) 0, transparent 100%)',
            backgroundSize: '100% 100%',
            animation: reduced ? undefined : 'jarvis-particles 7s linear infinite',
          }}
        />
        {/* central core */}
        <div
          style={{
            width: '46%',
            height: '46%',
            borderRadius: '50%',
            position: 'relative',
            zIndex: 2,
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 42%, rgba(5,5,6,0.95) 78%)`,
            boxShadow: `0 0 28px ${color}66, inset 0 0 18px rgba(255,255,255,0.12)`,
            border: `1px solid ${j2.glassBorder}`,
            animation: anim,
          }}
        />
        {/* listening waveform arcs */}
        {state === 'LISTENING' && !reduced ? (
          <>
            <span className="jarvis-wave" style={{ ...waveStyle(1, color) }} />
            <span className="jarvis-wave" style={{ ...waveStyle(2, color) }} />
          </>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 22,
          fontSize: Math.round(footprint * 0.07),
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: j2.text,
          lineHeight: 1.25,
        }}
      >
        {headline}
      </div>
      {detail ? (
        <div style={{ marginTop: 6, fontSize: 12, color: j2.muted, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
          {detail}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: color,
          fontWeight: 650,
        }}
      >
        {state.replace(/_/g, ' ')}
      </div>
    </div>
  )
}

function waveStyle(i: number, color: string): CSSProperties {
  return {
    position: 'absolute',
    inset: `${6 - i * 2}%`,
    borderRadius: '50%',
    border: `1px solid ${color}`,
    opacity: 0.35,
    animation: `jarvis-wave ${1.2 + i * 0.25}s ease-out infinite`,
    animationDelay: `${i * 0.2}s`,
    pointerEvents: 'none',
  }
}

const CORE_CSS = `
@keyframes jarvis-breathe {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.035); filter: brightness(1.08); }
}
@keyframes jarvis-listen {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.06); filter: brightness(1.15); }
}
@keyframes jarvis-think {
  0% { filter: hue-rotate(0deg) brightness(1); }
  50% { filter: hue-rotate(8deg) brightness(1.08); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}
@keyframes jarvis-orbit { to { transform: rotate(360deg); } }
@keyframes jarvis-scan {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.9; }
  50% { transform: scale(1.04) rotate(3deg); opacity: 1; }
}
@keyframes jarvis-particles {
  0% { transform: rotate(0deg) scale(1); }
  100% { transform: rotate(360deg) scale(1.02); }
}
@keyframes jarvis-create {
  0%, 100% { transform: scale(1); box-shadow: 0 0 24px rgba(255,98,0,0.35); }
  50% { transform: scale(1.05); box-shadow: 0 0 42px rgba(255,98,0,0.55); }
}
@keyframes jarvis-render {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.03); filter: brightness(1.12); }
}
@keyframes jarvis-amber-hold {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.1); }
}
@keyframes jarvis-complete {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes jarvis-error {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
}
@keyframes jarvis-wave {
  0% { transform: scale(0.92); opacity: 0.45; }
  100% { transform: scale(1.18); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .jarvis-glow, .jarvis-ring, .jarvis-noise, .jarvis-wave { animation: none !important; }
}
`
