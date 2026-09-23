'use client'

import { useState } from 'react'
import { Mic, Paperclip, Send } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
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
  onAttach,
  attachTitle,
  attachDisabled,
  attachBusy,
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
  /** Opens native file picker for private video ingest when provided. */
  onAttach?: () => void
  attachTitle?: string
  attachDisabled?: boolean
  /** True while ingest request is in flight (label shows Uploading…). */
  attachBusy?: boolean
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
  const attachEnabled = Boolean(onAttach) && !attachDisabled && !busy

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
            gap: 8,
            alignItems: 'center',
            borderRadius: 10,
            borderColor: focused ? 'rgba(255,98,0,0.4)' : colors.borderSubtle,
            boxShadow: 'none',
            transition: 'border-color 0.15s ease',
            background: '#101012',
            padding: '6px 8px 6px 10px',
          }}
        >
          <button
            type="button"
            title={voiceTitle || (voiceReady ? 'Hold to talk' : 'Voice unavailable')}
            aria-label={voiceReady ? 'Voice input' : 'Voice unavailable'}
            disabled={!voiceReady || busy}
            onClick={onMic}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${colors.borderSubtle}`,
              background: voiceReady ? 'rgba(255,98,0,0.12)' : 'transparent',
              color: voiceReady ? j2.amber : j2.muted,
              display: 'grid',
              placeItems: 'center',
              cursor: voiceReady ? 'pointer' : 'default',
              opacity: voiceReady ? 1 : 0.55,
              flexShrink: 0,
            }}
          >
            <Mic size={14} />
          </button>
          <input
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: j2.text,
              fontSize: 13,
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
          {onAttach ? (
            <button
              type="button"
              aria-label="Attach footage"
              title={attachTitle || 'Attach raw footage (private ingest)'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                height: 32,
                padding: '0 10px',
                borderRadius: 8,
                border: `1px solid ${attachEnabled ? 'rgba(255,98,0,0.45)' : colors.borderSubtle}`,
                background: attachBusy ? 'rgba(255,98,0,0.12)' : 'transparent',
                color: attachEnabled || attachBusy ? j2.amber : j2.muted,
                fontSize: 11,
                fontWeight: 650,
                letterSpacing: '0.02em',
                cursor: attachEnabled ? 'pointer' : 'default',
                opacity: attachEnabled || attachBusy ? 1 : 0.55,
              }}
              disabled={!attachEnabled}
              onClick={() => onAttach()}
            >
              <Paperclip size={13} />
              {attachBusy ? 'Uploading…' : 'Attach footage'}
            </button>
          ) : null}
          <button
            type="submit"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
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
            {busy ? '…' : <Send size={13} />}
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
