'use client'

import { useEffect, useRef, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { humanToolLabel } from '@/lib/jarvis/operator-present'
import { looksLikeRawPayload } from '@/lib/jarvis/operator-cockpit'
import { investigationTimelineIsActive } from '@/lib/jarvis/reasoning/boundaries'
import type { JarvisCommandState } from './use-jarvis-command'
import { CommandBar } from './CommandBar'
import * as s from './styles'

function StatusDot({ state }: { state: 'pending' | 'active' | 'done' | 'error' }) {
  const color =
    state === 'done' ? colors.success : state === 'error' ? colors.danger : state === 'active' ? s.accent : colors.textMuted
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
      }}
    />
  )
}

function displayStepLabel(label: string) {
  return label.includes('.') ? humanToolLabel(label) : label
}

function MessageEvidence({
  tools,
}: {
  tools: NonNullable<JarvisCommandState['messages'][number]['tool_activity']>
}) {
  const [open, setOpen] = useState(false)
  if (!tools.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...s.ghostBtn, border: 'none', padding: 0, fontSize: 12, color: colors.textMuted }}
      >
        {open ? 'Hide evidence' : 'Show evidence'}
      </button>
      {open ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {tools.map((t, i) => (
            <span key={`${t.label}-${i}`} style={s.badge(t.status === 'requires_approval' ? 'warn' : 'muted')}>
              {t.family || (t.tool ? humanToolLabel(t.tool) : t.label)}
              {t.status === 'requires_approval' ? ' · approval' : t.status === 'executed' ? ' · done' : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChatPane({ jarvis }: { jarvis: JarvisCommandState }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const title =
    jarvis.dashboard?.conversations?.find((c) => c.id === jarvis.conversationId)?.title ||
    (jarvis.conversationId ? 'Conversation' : 'New conversation')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [jarvis.messages, jarvis.streamText, jarvis.timeline])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.divider}`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={s.eyebrow}>Chat</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(jarvis.conversations ?? []).length ? (
            <select
              value={jarvis.conversationId ?? ''}
              onChange={(e) => {
                const id = e.target.value
                if (id) void jarvis.openConversation(id)
              }}
              style={{ ...s.input, width: 180, padding: '6px 8px' }}
              aria-label="Conversations"
            >
              <option value="">{title}</option>
              {jarvis.conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || 'Untitled'}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" style={s.ghostBtn} onClick={() => void jarvis.startNewConversation()}>
            New
          </button>
          <span style={s.badge(jarvis.dashboard?.live_meta_execution ? 'warn' : 'muted')}>
            Live Meta {jarvis.dashboard?.live_meta_execution ? 'ON' : 'OFF'}
          </span>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!jarvis.messages.length && !jarvis.streamText ? (
          <div style={{ margin: 'auto', maxWidth: 520, padding: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: '-0.03em' }}>Ask Jarvis to investigate.</div>
            <p style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
              Chat is a workspace, not the whole product. Significant actions still wait for your approval.
            </p>
          </div>
        ) : null}

        {jarvis.messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: m.role === 'user' ? '72%' : '88%',
              background: m.role === 'user' ? 'rgba(255,255,255,0.04)' : '#111113',
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div style={s.eyebrow}>{m.role === 'user' ? 'You' : 'Jarvis'}</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, marginTop: 4 }}>{m.content}</div>
            {m.tool_activity?.length ? <MessageEvidence tools={m.tool_activity} /> : null}
            {m.approval_ids?.length ? (
              <div style={{ ...s.muted, color: colors.warning }}>Jarvis wants permission — see Approvals.</div>
            ) : null}
          </div>
        ))}

        {jarvis.streamText ? (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '88%',
              background: '#111113',
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div style={s.eyebrow}>Jarvis</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, marginTop: 4 }}>
              {jarvis.streamText}
            </div>
          </div>
        ) : null}

        {investigationTimelineIsActive(jarvis.timeline, jarvis.busy) ? (
          <button
            type="button"
            onClick={() => jarvis.setTimelineOpen(!jarvis.timelineOpen)}
            style={{ ...s.card, textAlign: 'left', cursor: 'pointer' }}
          >
            <div style={s.eyebrow}>Working</div>
            {(jarvis.timelineOpen ? jarvis.timeline : jarvis.timeline.slice(-3)).map((step) => (
              <div key={step.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 13 }}>
                <StatusDot state={step.state} />
                <span>{displayStepLabel(step.label)}</span>
              </div>
            ))}
            {jarvis.timelineOpen && jarvis.timeline.some((t) => t.detail && !looksLikeRawPayload(t.detail)) ? (
              <div style={{ ...s.muted, marginTop: 8 }}>
                {jarvis.timeline
                  .filter((t) => t.detail && !looksLikeRawPayload(t.detail))
                  .slice(-2)
                  .map((t) => t.detail)
                  .join(' · ')}
              </div>
            ) : null}
          </button>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div style={s.composerDock}>
        <CommandBar
          value={jarvis.input}
          onChange={jarvis.setInput}
          onSubmit={(text) => void jarvis.sendMessage(text)}
          busy={jarvis.busy}
          extra
        />
      </div>
    </div>
  )
}
