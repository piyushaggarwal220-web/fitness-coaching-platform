'use client'

import { colors } from '@/lib/design-tokens'
import type { FootageAttachState } from './use-footage-upload'
import * as s from './styles'

/** Compact status strip above the command bar — real ingest states only. */
export function FootageAttachStrip({
  state,
  onUpload,
  onClear,
  onUseInCommand,
}: {
  state: FootageAttachState
  onUpload: () => void
  onClear: () => void
  onUseInCommand?: () => void
}) {
  if (state.status === 'idle') return null

  if (state.status === 'selected') {
    return (
      <div
        style={{
          ...s.card,
          padding: '8px 10px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.eyebrow}>Footage selected</div>
          <div style={{ fontSize: 12, fontWeight: 650, marginTop: 2 }}>{state.filename}</div>
          <div style={{ ...s.muted, marginTop: 0 }}>Not uploaded yet — confirm to ingest into Jarvis video session.</div>
        </div>
        <button type="button" style={{ ...s.solidBtn, padding: '6px 10px', fontSize: 12 }} onClick={onUpload}>
          Upload
        </button>
        <button type="button" style={{ ...s.ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={onClear}>
          Remove
        </button>
      </div>
    )
  }

  if (state.status === 'uploading') {
    return (
      <div style={{ ...s.card, padding: '8px 10px', marginBottom: 8 }}>
        <div style={s.eyebrow}>Uploading</div>
        <div style={{ fontSize: 12, fontWeight: 650, marginTop: 2 }}>{state.filename}</div>
        <div style={{ ...s.muted, marginTop: 0 }}>Creating session and storing private source…</div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        style={{
          ...s.card,
          padding: '8px 10px',
          marginBottom: 8,
          borderColor: 'rgba(239,68,68,0.35)',
        }}
      >
        <div style={s.eyebrow}>Upload failed</div>
        <div style={{ fontSize: 12, fontWeight: 650, marginTop: 2 }}>{state.filename || 'Footage'}</div>
        <div style={{ fontSize: 12, color: colors.danger, marginTop: 2 }}>{state.message}</div>
        <button type="button" style={{ ...s.ghostBtn, marginTop: 6, padding: '4px 8px', fontSize: 11 }} onClick={onClear}>
          Dismiss
        </button>
      </div>
    )
  }

  // ready
  return (
    <div
      style={{
        ...s.card,
        padding: '8px 10px',
        marginBottom: 8,
        borderColor: 'rgba(34,197,94,0.35)',
      }}
    >
      <div style={s.eyebrow}>Footage attached</div>
      <div style={{ fontSize: 12, fontWeight: 650, marginTop: 2 }}>{state.filename}</div>
      <div style={{ ...s.muted, marginTop: 0 }}>
        Ready for analysis · session {state.sessionId.slice(0, 8)}…
        {state.sourceRef ? ` · ${state.sourceRef.slice(0, 28)}…` : ''}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {onUseInCommand ? (
          <button type="button" style={{ ...s.solidBtn, padding: '6px 10px', fontSize: 12 }} onClick={onUseInCommand}>
            Analyze with Jarvis
          </button>
        ) : null}
        <button type="button" style={{ ...s.ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  )
}
