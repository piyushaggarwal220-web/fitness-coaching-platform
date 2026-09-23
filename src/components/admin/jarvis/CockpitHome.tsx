'use client'

/**
 * Jarvis 2.0 operator home — hero core + contextual panels.
 * Conversation left · Core center · Context right · Command bottom.
 */

import { useMemo } from 'react'
import {
  OPERATOR_QUICK_CHIPS,
  coreHeadline,
  coreStateFromContext,
} from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { CommandBar } from './CommandBar'
import { JarvisCore } from './JarvisCore'
import { JarvisConversation } from './JarvisConversation'
import { JarvisContextPanel } from './JarvisContextPanel'
import { j2, composerDock } from './styles'

export function CockpitHome({
  jarvis,
  onNavigate,
  compact,
}: {
  jarvis: JarvisCommandState
  onNavigate: (view: CommandView) => void
  compact?: boolean
}) {
  const cockpit = jarvis.dashboard?.cockpit
  const execution = jarvis.dashboard?.execution
  const cost = jarvis.dashboard?.cost as { daily_spent_usd?: number | null; daily_limit_usd?: number | null } | undefined
  const spent = cost?.daily_spent_usd
  const limit = cost?.daily_limit_usd
  const budgetExhausted =
    typeof spent === 'number' && typeof limit === 'number' && limit > 0 && spent >= limit

  const activeStep = jarvis.timeline.find((t) => t.state === 'active')
  const activeTool =
    (activeStep?.id.startsWith('tool-') ? activeStep.id.replace(/^tool-/, '') : null) ||
    (activeStep?.detail?.includes('.') ? activeStep.detail : null) ||
    null

  const core = useMemo(
    () =>
      coreStateFromContext({
        busy: jarvis.busy,
        error: jarvis.error || null,
        pendingApprovals: jarvis.pendingApprovals.length,
        budgetExhausted,
        killSwitch: Boolean(execution?.kill_switch),
        activeTool,
        timelineActiveLabel: activeStep?.label || null,
      }),
    [
      jarvis.busy,
      jarvis.error,
      jarvis.pendingApprovals.length,
      budgetExhausted,
      execution?.kill_switch,
      activeTool,
      activeStep?.label,
    ]
  )

  const realtime = jarvis.dashboard?.realtime
  const voiceMod = realtime?.modalities?.voice_input || realtime?.status
  const voiceStatus: 'ready' | 'off' | 'unavailable' =
    voiceMod === 'CONNECTED' ? 'ready' : voiceMod === 'DISABLED' ? 'off' : 'unavailable'
  const voiceTitle =
    (realtime as { note?: string } | undefined)?.note ||
    (voiceStatus === 'off'
      ? 'JARVIS_REALTIME_ENABLED is not true. Text chat remains available.'
      : 'Voice not configured. Text chat remains available.')

  const autonomous = (jarvis.dashboard?.autonomous_operator?.attention || []) as {
    severity: string
    system: string
    title: string
    next_action: string
  }[]

  const headline = coreHeadline(core.state, cockpit?.greeting)
  const showConversation = jarvis.messages.length > 0 || Boolean(jarvis.streamText) || jarvis.busy

  if (!cockpit) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <JarvisCore state="THINKING" headline="Loading." size={compact ? 240 : 300} />
      </div>
    )
  }

  const coreSize = compact ? 240 : 320

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: `
          radial-gradient(ellipse 55% 45% at 50% 38%, rgba(255,98,0,0.07), transparent 70%),
          radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,0,0,0.55), transparent 55%),
          linear-gradient(180deg, rgba(255,255,255,0.015) 0%, transparent 40%),
          ${j2.bg}
        `,
        position: 'relative',
      }}
    >
      {/* subtle grid */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: compact
            ? '1fr'
            : showConversation
              ? 'minmax(220px, 0.85fr) minmax(0, 1.35fr) minmax(260px, 0.9fr)'
              : 'minmax(0, 1.4fr) minmax(280px, 0.9fr)',
          gap: compact ? 12 : 16,
          padding: compact ? '12px 12px 4px' : '16px 20px 4px',
          alignItems: 'stretch',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {!compact && showConversation ? (
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <JarvisConversation jarvis={jarvis} compact />
          </div>
        ) : null}

        <div
          style={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: compact ? 'flex-start' : 'center',
            paddingTop: compact ? 8 : 0,
            gap: 18,
          }}
        >
          <JarvisCore
            state={core.state}
            headline={headline}
            detail={core.state === 'IDLE' ? 'What should I take care of?' : core.detail}
            size={coreSize}
          />
          <div
            style={{
              display: 'flex',
              gap: 8,
              maxWidth: '100%',
              overflowX: 'auto',
              padding: '0 4px 4px',
              scrollbarWidth: 'thin',
            }}
          >
            {OPERATOR_QUICK_CHIPS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void jarvis.sendMessage(a.prompt)}
                style={{
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${j2.glassBorder}`,
                  borderRadius: 999,
                  color: j2.muted,
                  fontSize: 12,
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          {compact && showConversation ? (
            <div style={{ width: '100%', minHeight: 0, flex: 1 }}>
              <JarvisConversation jarvis={jarvis} compact />
            </div>
          ) : null}
        </div>

        {!compact || !showConversation ? (
          <JarvisContextPanel
            mode={core.state}
            jarvis={jarvis}
            metrics={cockpit.metrics}
            attention={cockpit.attention || []}
            autonomous={autonomous}
            onNavigate={onNavigate}
            compact={compact}
          />
        ) : null}
      </div>

      {compact && showConversation ? null : compact ? (
        <div style={{ padding: '0 12px 4px', position: 'relative', zIndex: 1 }}>
          <JarvisContextPanel
            mode={core.state}
            jarvis={jarvis}
            metrics={cockpit.metrics}
            attention={cockpit.attention || []}
            autonomous={autonomous}
            onNavigate={onNavigate}
            compact
          />
        </div>
      ) : null}

      <div
        style={{
          ...composerDock,
          background: 'rgba(5,5,6,0.85)',
          borderTop: `1px solid ${j2.glassBorder}`,
          padding: compact ? '10px 12px 12px' : '12px 20px 16px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <CommandBar
          value={jarvis.input}
          onChange={jarvis.setInput}
          onSubmit={(text) => void jarvis.sendMessage(text)}
          busy={jarvis.busy}
          placeholder="Ask Jarvis anything..."
          voiceStatus={voiceStatus}
          voiceTitle={voiceTitle}
          showChips={false}
        />
      </div>
    </div>
  )
}
