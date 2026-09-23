'use client'

import type { CSSProperties } from 'react'

type Props = {
  onContinue: () => void
  onBack: () => void
  styles: Record<string, CSSProperties>
  dig: (base: CSSProperties, key?: string) => CSSProperties
}

const panel: CSSProperties = {
  margin: '0 0 24px',
  padding: '18px 16px',
  borderRadius: 14,
  border: '1px solid rgba(251, 191, 36, 0.22)',
  background:
    'linear-gradient(165deg, rgba(34, 197, 94, 0.1) 0%, rgba(28, 25, 23, 0.92) 42%, #1c1917 100%)',
}

const list: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const item: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  fontSize: 14,
  lineHeight: 1.45,
  color: '#e2e8f0',
}

const mark: CSSProperties = {
  flexShrink: 0,
  width: 22,
  height: 22,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(34, 197, 94, 0.18)',
  color: '#4ade80',
  fontSize: 12,
  fontWeight: 800,
  marginTop: 1,
}

export function CheckoutMoreInfoStep({ onContinue, onBack, styles, dig }: Props) {
  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <button type="button" onClick={onBack} style={dig(styles.backToDetails, 'backLink')}>
        {'<- Edit basics'}
      </button>

      <div style={panel}>
        <ul style={list}>
          <li style={item}>
            <span style={mark} aria-hidden>
              1
            </span>
            <span>Short follow-up questions after you unlock</span>
          </li>
          <li style={item}>
            <span style={mark} aria-hidden>
              2
            </span>
            <span>Plan delivered in the app — not a generic PDF</span>
          </li>
          <li style={item}>
            <span style={mark} aria-hidden>
              3
            </span>
            <span>Built from your answers, by the coach</span>
          </li>
        </ul>
      </div>

      <button type="button" style={{ ...dig(styles.payBtn, 'payBtn'), width: '100%' }} onClick={onContinue}>
        Complete checkout to continue
      </button>
    </div>
  )
}
