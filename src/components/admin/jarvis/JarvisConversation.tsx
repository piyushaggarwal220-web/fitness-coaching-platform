'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { looksLikeRawPayload } from '@/lib/jarvis/operator-cockpit'
import { humanToolLabel } from '@/lib/jarvis/operator-present'
import type { JarvisCommandState } from './use-jarvis-command'
import { JarvisOperationTimeline } from './JarvisOperationTimeline'
import { JarvisApprovalCard } from './JarvisApprovalCard'
import { j2, glassPanel } from './styles'

export function JarvisConversation({
  jarvis,
  compact,
}: {
  jarvis: JarvisCommandState
  compact?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const pending = jarvis.pendingApprovals.slice(0, 2)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [jarvis.messages, jarvis.streamText, jarvis.timeline])

  const shellStyle: CSSProperties = {
    ...glassPanel,
    padding: compact ? 10 : 14,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  }

  return (
    <section style={shellStyle} aria-label="Conversation">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Conversation
      </div>
      <div style={{ overflowY: 'auto', marginTop: 10, minHeight: 120, maxHeight: compact ? 280 : 420 }}>
        {!jarvis.messages.length && !jarvis.streamText ? (
          <div style={{ color: j2.muted, fontSize: 13, lineHeight: 1.5 }}>
            Speak or type naturally. Jarvis routes through the existing operator — tools, approvals, and verification stay
            the same.
          </div>
        ) : null}
        {jarvis.messages.map((m) => {
          const isUser = m.role === 'user'
          const content = looksLikeRawPayload(m.content)
            ? 'Response available — open technical details if needed.'
            : m.content
          return (
            <div
              key={m.id}
              style={{
                marginBottom: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: isUser ? j2.muted : j2.amber,
                  marginBottom: 4,
                }}
              >
                {isUser ? 'You' : 'Jarvis'}
                {m.thinking_summary === 'voice' ? ' · voice' : ''}
              </div>
              <div
                style={{
                  maxWidth: '92%',
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: isUser ? 'rgba(255,255,255,0.04)' : 'rgba(255,98,0,0.08)',
                  border: `1px solid ${j2.glassBorder}`,
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: j2.text,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {content}
              </div>
              {m.tool_activity?.length ? (
                <details style={{ marginTop: 6, fontSize: 11, color: j2.muted }}>
                  <summary style={{ cursor: 'pointer' }}>Technical details</summary>
                  <div style={{ marginTop: 4 }}>
                    {m.tool_activity.map((t, i) => (
                      <div key={`${t.tool || t.label}-${i}`}>
                        {t.tool ? humanToolLabel(t.tool) : t.label}
                        {t.status ? ` · ${t.status}` : ''}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )
        })}
        {jarvis.streamText ? (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: j2.amber,
                marginBottom: 4,
              }}
            >
              Jarvis
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(255,98,0,0.08)',
                border: `1px solid ${j2.glassBorder}`,
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {jarvis.streamText}
            </div>
          </div>
        ) : null}
        {jarvis.timeline.length ? (
          <div style={{ marginBottom: 12 }}>
            <JarvisOperationTimeline
              steps={jarvis.timeline}
              open={jarvis.timelineOpen}
              onToggle={() => jarvis.setTimelineOpen(!jarvis.timelineOpen)}
            />
          </div>
        ) : null}
        {pending.map((a) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <JarvisApprovalCard
              approval={a}
              busy={jarvis.busy}
              onDecide={jarvis.decide}
              onRevise={(label) =>
                void jarvis.sendMessage(`Modify this approval: ${label}. Propose a safer alternative.`)
              }
              compact
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
