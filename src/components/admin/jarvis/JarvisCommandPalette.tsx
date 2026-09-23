'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PALETTE_COMMANDS } from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import { j2, glassPanel, input } from './styles'

type PaletteItem =
  | { kind: 'prompt'; id: string; label: string; prompt: string; group: string }
  | { kind: 'nav'; id: string; label: string; view: CommandView; group: string }

const NAV_ITEMS: PaletteItem[] = [
  { kind: 'nav', id: 'nav-home', label: 'Operator home', view: 'command', group: 'Navigate' },
  { kind: 'nav', id: 'nav-chat', label: 'Full conversation', view: 'chat', group: 'Navigate' },
  { kind: 'nav', id: 'nav-approvals', label: 'Approvals', view: 'approvals', group: 'Navigate' },
  { kind: 'nav', id: 'nav-video', label: 'Video workspace', view: 'video', group: 'Navigate' },
  { kind: 'nav', id: 'nav-creatives', label: 'Creatives', view: 'creatives', group: 'Navigate' },
  { kind: 'nav', id: 'nav-content', label: 'Content operations', view: 'content_ops', group: 'Navigate' },
  { kind: 'nav', id: 'nav-settings', label: 'Settings', view: 'settings', group: 'Navigate' },
]

export function JarvisCommandPalette({
  open,
  onClose,
  onAsk,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onAsk: (prompt: string) => void
  onNavigate: (view: CommandView) => void
}) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const promptItems: PaletteItem[] = PALETTE_COMMANDS.map((c) => ({
      kind: 'prompt',
      id: c.id,
      label: c.label,
      prompt: c.prompt,
      group: c.group,
    }))
    const all = [...promptItems, ...NAV_ITEMS]
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((i) => i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle))
  }, [q])

  useEffect(() => {
    if (!open) return
    setQ('')
    setIdx(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setIdx(0)
  }, [q])

  if (!open) return null

  function run(item: PaletteItem) {
    onClose()
    if (item.kind === 'prompt') onAsk(item.prompt)
    else onNavigate(item.view)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jarvis command palette"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{ ...glassPanel, width: 'min(560px, 92vw)', padding: 12, background: 'rgba(12,12,16,0.96)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask Jarvis or jump…"
          aria-label="Command search"
          style={{ ...input, background: 'rgba(255,255,255,0.03)', borderColor: j2.glassBorder }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(i + 1, Math.max(0, items.length - 1)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter' && items[idx]) {
              e.preventDefault()
              run(items[idx])
            }
          }}
        />
        <div style={{ marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => run(item)}
              onMouseEnter={() => setIdx(i)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                background: i === idx ? j2.amberSoft : 'transparent',
                border: 'none',
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                color: j2.text,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 11, color: j2.muted }}>{item.group}</span>
            </button>
          ))}
          {!items.length ? <div style={{ padding: 12, color: j2.muted, fontSize: 13 }}>No matches</div> : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: j2.muted }}>
          ↑↓ navigate · Enter run · Esc close · Ctrl/⌘ K
        </div>
      </div>
    </div>
  )
}
