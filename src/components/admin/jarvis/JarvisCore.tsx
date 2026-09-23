'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import type { JarvisCoreState } from '@/lib/jarvis/operator-present'
import { j2 } from './styles'

const STATE_COLOR: Record<JarvisCoreState, string> = {
  IDLE: 'rgba(255,255,255,0.22)',
  LISTENING: j2.amber,
  THINKING: 'rgba(251, 191, 36, 0.85)',
  OBSERVING: j2.cyan,
  RESEARCHING: 'rgba(167, 139, 250, 0.8)',
  PLANNING: 'rgba(251, 191, 36, 0.85)',
  CREATING: j2.amber,
  RENDERING: 'rgba(56, 189, 248, 0.9)',
  WAITING_FOR_APPROVAL: 'rgba(245, 158, 11, 0.95)',
  EXECUTING: 'rgba(52, 211, 153, 0.9)',
  VERIFYING: j2.cyan,
  LEARNING: 'rgba(167, 139, 250, 0.8)',
  COMPLETED: 'rgba(52, 211, 153, 0.75)',
  ERROR: 'rgba(248, 113, 113, 0.95)',
  PAUSED: 'rgba(161, 161, 170, 0.7)',
}

export function JarvisCore({
  state,
  detail,
  size = 120,
}: {
  state: JarvisCoreState
  detail: string
  size?: number
}) {
  const color = STATE_COLOR[state]
  const active = !['IDLE', 'COMPLETED', 'PAUSED'].includes(state)
  const pulse = state === 'LISTENING' || state === 'THINKING' || state === 'RENDERING'
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const orb: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    position: 'relative',
    margin: '0 auto',
    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), transparent 42%), radial-gradient(circle at 50% 55%, ${color}, rgba(5,5,6,0.95) 68%)`,
    boxShadow: active
      ? `0 0 ${pulse && !reduced ? 36 : 22}px ${color}, inset 0 0 24px rgba(255,255,255,0.06)`
      : `0 0 18px rgba(255,255,255,0.06), inset 0 0 20px rgba(255,255,255,0.04)`,
    border: `1px solid ${j2.glassBorder}`,
    transition: reduced ? 'none' : 'box-shadow 0.45s ease, background 0.45s ease',
    animation: pulse && !reduced ? 'jarvis-core-breathe 2.4s ease-in-out infinite' : undefined,
  }

  return (
    <div style={{ textAlign: 'center' }} role="status" aria-live="polite" aria-label={`Jarvis ${state}: ${detail}`}>
      <style>{`
        @keyframes jarvis-core-breathe {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.03); filter: brightness(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes jarvis-core-breathe { 0%, 100% { transform: none; filter: none; } }
        }
      `}</style>
      <div style={orb}>
        <div
          style={{
            position: 'absolute',
            inset: '18%',
            borderRadius: '50%',
            border: `1px solid ${j2.glassBorder}`,
            background: 'rgba(0,0,0,0.25)',
          }}
        />
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: color,
          fontWeight: 650,
        }}
      >
        {state.replace(/_/g, ' ')}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: j2.muted, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
        {detail}
      </div>
    </div>
  )
}
