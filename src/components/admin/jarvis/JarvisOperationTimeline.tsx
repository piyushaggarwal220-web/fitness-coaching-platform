'use client'

import { useState } from 'react'
import { humanToolLabel } from '@/lib/jarvis/operator-present'
import type { TimelineStep } from './types'
import { j2, glassPanel } from './styles'

function displayLabel(label: string) {
  return label.includes('.') ? humanToolLabel(label) : label
}

function glyph(state: TimelineStep['state']) {
  if (state === 'done') return '✓'
  if (state === 'error') return '!'
  if (state === 'active') return '●'
  return '○'
}

function color(state: TimelineStep['state']) {
  if (state === 'done') return 'rgba(52, 211, 153, 0.9)'
  if (state === 'error') return 'rgba(248, 113, 113, 0.95)'
  if (state === 'active') return j2.amber
  return 'rgba(161, 161, 170, 0.55)'
}

export function JarvisOperationTimeline({
  steps,
  open = true,
  onToggle,
}: {
  steps: TimelineStep[]
  open?: boolean
  onToggle?: () => void
}) {
  const [techOpen, setTechOpen] = useState(false)
  if (!steps.length) return null

  return (
    <div style={{ ...glassPanel, padding: '12px 14px' }} aria-label="Live operation">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
          Live operation
        </div>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            style={{ background: 'none', border: 'none', color: j2.muted, fontSize: 12, cursor: 'pointer' }}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </div>
      {open ? (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {steps.map((step) => (
            <li
              key={step.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '5px 0',
                color: color(step.state),
                fontSize: 13,
              }}
            >
              <span aria-hidden style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>
                {glyph(step.state)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: step.state === 'pending' ? j2.muted : j2.text }}>{displayLabel(step.label)}</div>
                {step.detail && techOpen ? (
                  <div style={{ fontSize: 11, color: j2.muted, marginTop: 2 }}>{step.detail}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={() => setTechOpen((v) => !v)}
        style={{
          marginTop: 8,
          background: 'none',
          border: 'none',
          color: j2.muted,
          fontSize: 11,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {techOpen ? 'Hide technical details' : 'Technical details'}
      </button>
    </div>
  )
}
