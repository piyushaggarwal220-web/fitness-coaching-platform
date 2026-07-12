import { BRAND_NAME } from '@/lib/brand'
import { colors } from '@/lib/design-tokens'
import type { CSSProperties } from 'react'

type BrandMarkProps = {
  style?: CSSProperties
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles: Record<NonNullable<BrandMarkProps['size']>, CSSProperties> = {
  sm: { fontSize: 12, letterSpacing: '0.14em' },
  md: { fontSize: 14, letterSpacing: '0.12em' },
  lg: { fontSize: 'clamp(18px, 4vw, 22px)', letterSpacing: '-0.02em' },
}

export function BrandMark({ style, size = 'sm' }: BrandMarkProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        margin: 0,
        fontWeight: 800,
        color: colors.accent,
        textTransform: size === 'lg' ? 'none' : 'uppercase',
        ...sizeStyles[size],
        ...style,
      }}
    >
      {BRAND_NAME}
    </span>
  )
}
