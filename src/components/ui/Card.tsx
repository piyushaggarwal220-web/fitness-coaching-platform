'use client'

import type { CSSProperties, ReactNode } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type CardVariant = 'default' | 'glass' | 'elevated'

type CardProps = {
  children: ReactNode
  variant?: CardVariant
  padding?: keyof typeof spacing | number
  style?: CSSProperties
  onClick?: () => void
  className?: string
}

const variantStyles: Record<CardVariant, CSSProperties> = {
  default: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.borderSubtle}`,
  },
  glass: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${colors.borderSubtle}`,
  },
  elevated: {
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
  },
}

export function Card({ children, variant = 'default', padding = 4, style, onClick, className }: CardProps) {
  const pad = typeof padding === 'number' ? padding : spacing[padding]

  return (
    <div
      onClick={onClick}
      className={`animate-fade-in ${className ?? ''}`}
      style={{
        borderRadius: radius.md,
        padding: pad,
        marginBottom: spacing[3],
        ...variantStyles[variant],
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon?: ReactNode
  highlight?: boolean
}) {
  return (
    <Card variant="elevated" padding={3} style={{ marginBottom: 0, textAlign: 'center' }}>
      {icon && <div style={{ marginBottom: spacing[1], color: highlight ? colors.accent : colors.textMuted }}>{icon}</div>}
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: highlight ? colors.accent : colors.textPrimary, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </Card>
  )
}
