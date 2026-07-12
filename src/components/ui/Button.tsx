'use client'

import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from 'react'
import { colors, radius, shadows } from '@/lib/design-tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    boxShadow: shadows.accent,
  },
  secondary: {
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    boxShadow: 'none',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    border: 'none',
    boxShadow: 'none',
  },
  danger: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    border: `1px solid rgba(239, 68, 68, 0.2)`,
    boxShadow: 'none',
  },
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  md: { minHeight: 48, padding: '12px 20px', fontSize: 15 },
  lg: { minHeight: 56, padding: '14px 24px', fontSize: 16 },
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`btn-press ${className ?? ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 600,
        borderRadius: radius.md,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        width: fullWidth ? '100%' : undefined,
        transition: 'transform 150ms ease, opacity 150ms ease',
        touchAction: 'manipulation',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: 18,
            height: 18,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  )
}
