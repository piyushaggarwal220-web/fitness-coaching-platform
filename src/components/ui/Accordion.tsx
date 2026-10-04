'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { radius, spacing } from '@/lib/design-tokens'

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
        backgroundColor: 'var(--bg-card)',
        borderRadius: radius.md,
        marginBottom: spacing[2],
        border: '1px solid var(--border-subtle)',
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
          color: 'var(--text-primary)',
        }}
      >
        {icon && <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{title}</span>
        <ChevronDown
          size={20}
          color="currentColor"
          className={`accordion-chevron ${isOpen ? 'accordion-chevron--open' : ''}`}
          style={{ flexShrink: 0, color: 'var(--text-muted)' }}
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
