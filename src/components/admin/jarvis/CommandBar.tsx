'use client'

import { useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'
import { j2, glassPanel } from './styles'

export function CommandBar({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = 'Ask Jarvis anything...',
  voiceStatus,
  voiceTitle,
  onMic,
  showChips,
  chips,
  /** @deprecated use showChips + chips */
  extra,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: (text?: string) => void
  busy?: boolean
  placeholder?: string
  /** Subtle voice availability — never blocks text. */
  voiceStatus?: 'ready' | 'off' | 'unavailable'
  voiceTitle?: string
  onMic?: () => void
  showChips?: boolean
  chips?: { id: string; label: string; prompt: string }[]
  extra?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const voiceReady = voiceStatus === 'ready'
  const resolvedChips =
    chips ||
    (extra
      ? [
          { id: 'today', label: "Today's brief", prompt: 'What happened today?' },
          { id: 'problems', label: 'Find problems', prompt: 'Find problems in my business.' },
          { id: 'revenue', label: 'Analyze revenue', prompt: 'How much money did we make today?' },
          { id: 'ads', label: 'Check ads', prompt: 'How much did I spend on Meta ads today?' },
        ]
      : undefined)
  const shouldShowChips = showChips ?? Boolean(extra)

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div
          style={{
            ...glassPanel,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: 16,
            borderColor: focused ? 'rgba(255,98,0,0.45)' : j2.glassBorder,
            boxShadow: focused ? '0 0 0 1px rgba(255,98,0,0.2), 0 0 28px rgba(255,98,0,0.12)' : 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            background: 'rgba(14,14,18,0.88)',
          }}
        >
          <button
            type="button"
            title={voiceTitle || (voiceReady ? 'Hold to talk' : 'Voice unavailable')}
            aria-label={voiceReady ? 'Voice input' : 'Voice unavailable'}
            disabled={!voiceReady || busy}
            onClick={onMic}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: `1px solid ${j2.glassBorder}`,
              background: voiceReady ? j2.amberSoft : 'rgba(255,255,255,0.03)',
              color: voiceReady ? j2.amber : j2.muted,
              display: 'grid',
              placeItems: 'center',
              cursor: voiceReady ? 'pointer' : 'default',
              opacity: voiceReady ? 1 : 0.55,
              flexShrink: 0,
            }}
          >
            <Mic size={16} />
          </button>
          <input
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: j2.text,
              fontSize: 15,
              fontFamily: 'inherit',
              padding: '6px 0',
            }}
            placeholder={placeholder}
            value={value}
            disabled={busy}
            aria-label="Ask Jarvis"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSubmit()
              }
            }}
          />
          <button
            type="button"
            aria-label="Attach"
            title="Attachments use existing private storage when supported"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: j2.muted,
              display: 'grid',
              placeItems: 'center',
              cursor: 'default',
              opacity: 0.5,
            }}
            disabled
          >
            <Paperclip size={15} />
          </button>
          <button
            type="submit"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: 'none',
              background: value.trim() && !busy ? j2.amber : 'rgba(255,255,255,0.06)',
              color: value.trim() && !busy ? '#0a0a0a' : j2.muted,
              display: 'grid',
              placeItems: 'center',
              cursor: value.trim() && !busy ? 'pointer' : 'default',
              flexShrink: 0,
            }}
            disabled={busy || !value.trim()}
            aria-label="Send to Jarvis"
          >
            {busy ? '…' : <Send size={15} />}
          </button>
        </div>
      </form>
      {shouldShowChips && resolvedChips?.length ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 10,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'thin',
          }}
        >
          {resolvedChips.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={busy}
              onClick={() => onSubmit(q.prompt)}
              style={{
                flexShrink: 0,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${j2.glassBorder}`,
                borderRadius: 999,
                color: j2.muted,
                fontSize: 12,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}
      {voiceStatus && voiceStatus !== 'ready' ? (
        <div style={{ marginTop: 6, fontSize: 11, color: j2.muted }} title={voiceTitle}>
          ● Voice {voiceStatus === 'off' ? 'off' : 'unavailable'}
        </div>
      ) : null}
    </div>
  )
}
