'use client'

import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { colors, radius, shadows, transition } from '@/lib/design-tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  success?: boolean
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
  success = false,
  fullWidth = false,
  disabled,
  children,
  style,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`btn-press ${success ? 'btn-press--success' : ''} ${className ?? ''}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 600,
        borderRadius: radius.md,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        width: fullWidth ? '100%' : undefined,
        transition: transition('fast', 'transform, opacity, background-color, box-shadow'),
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
      {success && !loading && <Check size={18} strokeWidth={3} />}
      {children}
    </button>
  )
}
