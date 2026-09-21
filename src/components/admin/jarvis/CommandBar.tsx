'use client'

import { Send } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { DOMAIN_COMMANDS, QUICK_COMMANDS } from '@/lib/jarvis/operator-present'
import * as s from './styles'

export function CommandBar({
  value,
  onChange,
  onSubmit,
  busy,
  extra,
  placeholder = 'Ask Jarvis…',
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: (text?: string) => void
  busy?: boolean
  extra?: boolean
  placeholder?: string
}) {
  const commands = extra ? [...QUICK_COMMANDS, ...DOMAIN_COMMANDS] : QUICK_COMMANDS
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div style={{ ...s.composerWrap, padding: '4px 6px 4px 12px' }}>
          <input
            style={{
              ...s.input,
              border: 'none',
              background: 'transparent',
              padding: '8px 0',
              fontSize: 13,
              boxShadow: 'none',
            }}
            placeholder={placeholder}
            value={value}
            disabled={busy}
            aria-label="Ask Jarvis"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSubmit()
              }
            }}
          />
          <button
            type="submit"
            style={{ ...s.solidBtn, minWidth: 32, minHeight: 32, padding: 0, display: 'grid', placeItems: 'center' }}
            disabled={busy || !value.trim()}
            aria-label="Send to Jarvis"
          >
            {busy ? '…' : <Send size={13} />}
          </button>
        </div>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {commands.map((q) => (
          <button
            key={q.id}
            type="button"
            disabled={busy}
            onClick={() => onSubmit(q.prompt)}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              fontSize: 11,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  )
}
