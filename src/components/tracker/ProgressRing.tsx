'use client'

import { colors } from '@/lib/design-tokens'

type ProgressRingProps = {
  percent: number
  size?: number
  stroke?: number
  label?: string
  sublabel?: string
}

export function ProgressRing({ percent, size = 120, stroke = 10, label, sublabel }: ProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 12px ${colors.accentGlow})` }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.bgElevated}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size * 0.24, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em' }}>
          {clamped}%
        </span>
        {label && (
          <span style={{ fontSize: Math.max(10, size * 0.08), color: colors.textMuted, marginTop: 4, fontWeight: 600, textAlign: 'center', maxWidth: size * 0.7, lineHeight: 1.2 }}>
            {label}
          </span>
        )}
        {sublabel && (
          <span style={{ fontSize: 10, color: colors.accent, marginTop: 2, fontWeight: 600 }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
