'use client'

import type { CSSProperties, ReactNode } from 'react'
import { radius, spacing } from '@/lib/design-tokens'
import { usePortalColors } from '@/lib/client-theme'
import { motionClass, staggerClass } from '@/lib/motion'

type CardVariant = 'default' | 'glass' | 'elevated'

type CardProps = {
  children: ReactNode
  variant?: CardVariant
  padding?: keyof typeof spacing | number
  style?: CSSProperties
  onClick?: () => void
  className?: string
  /** Stagger index for list entrance animations */
  staggerIndex?: number
  interactive?: boolean
}

function variantStyles(colors: {
  bgCard: string
  bgGlass: string
  bgElevated: string
  borderSubtle: string
}): Record<CardVariant, CSSProperties> {
  return {
    default: {
      backgroundColor: colors.bgCard,
      border: `1px solid ${colors.borderSubtle}`,
    },
    glass: {
      backgroundColor: colors.bgGlass,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${colors.borderSubtle}`,
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
    },
    elevated: {
      backgroundColor: colors.bgElevated,
      border: `1px solid ${colors.borderSubtle}`,
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
    },
  }
}

export function Card({
  children,
  variant = 'default',
  padding = 4,
  style,
  onClick,
  className,
  staggerIndex,
  interactive,
}: CardProps) {
  const colors = usePortalColors()
  const pad = typeof padding === 'number' ? padding : spacing[padding]
  const motionClasses = [
    motionClass.cardEnter,
    staggerIndex != null ? staggerClass(staggerIndex) : '',
    interactive || onClick ? motionClass.cardInteractive : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={motionClasses}
      style={{
        borderRadius: radius.md,
        padding: pad,
        marginBottom: spacing[3],
        ...variantStyles(colors)[variant],
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
  staggerIndex,
}: {
  label: string
  value: string
  icon?: ReactNode
  highlight?: boolean
  staggerIndex?: number
}) {
  const colors = usePortalColors()
  return (
    <Card variant="elevated" padding={3} style={{ marginBottom: 0, textAlign: 'center' }} staggerIndex={staggerIndex}>
      {icon && <div style={{ marginBottom: spacing[1], color: highlight ? colors.accent : colors.textMuted }}>{icon}</div>}
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: highlight ? colors.accent : colors.textPrimary, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </Card>
  )
}
