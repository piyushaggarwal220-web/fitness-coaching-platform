'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type AccordionItemProps = {
  title: string
  icon?: ReactNode
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}

export function AccordionItem({ title, icon, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div
      style={{
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        marginBottom: spacing[2],
        border: `1px solid ${colors.borderSubtle}`,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="btn-press"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing[2],
          width: '100%',
          padding: `${spacing[4]}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          minHeight: 64,
          color: colors.textPrimary,
        }}
      >
        {icon && <span style={{ color: colors.accent, display: 'flex' }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{title}</span>
        <ChevronDown
          size={20}
          color={colors.textMuted}
          className={`accordion-chevron ${isOpen ? 'accordion-chevron--open' : ''}`}
          style={{ flexShrink: 0 }}
        />
      </button>
      <div className={`accordion-grid ${isOpen ? 'accordion-grid--open' : ''}`}>
        <div className="accordion-grid-inner">
          <div style={{ padding: `0 ${spacing[4]}px ${spacing[4]}px` }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
