'use client'

/**
 * Jarvis 2.0 operator home — front door to existing orchestration.
 * Reuses dashboard cockpit metrics, chat/voice, Phase 12 approvals.
 */

import { useMemo } from 'react'
import {
  OPERATOR_QUICK_ACTIONS,
  coreStateFromContext,
} from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { CommandBar } from './CommandBar'
import { JarvisCore } from './JarvisCore'
import { JarvisConversation } from './JarvisConversation'
import { JarvisVoiceButton } from './JarvisVoiceButton'
import { JarvisBusinessPulse } from './JarvisBusinessPulse'
import { JarvisAttention } from './JarvisAttention'
import { JarvisCostStatus } from './JarvisCostStatus'
import { JarvisSystemStatus } from './JarvisSystemStatus'
import { JarvisVideoResult } from './JarvisVideoResult'
import { JarvisCreativeGallery } from './JarvisCreativeGallery'
import { j2, glassPanel, ghostBtn, composerDock } from './styles'

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

  const videoJobs = (jarvis.dashboard?.video_workspace as { recent_jobs?: { id?: string; title?: string; status?: string; duration?: string; aspect_ratio?: string; cost?: string }[] } | undefined)
    ?.recent_jobs
  const latestReadyVideo = videoJobs?.find((j) => /ready|complete|rendered/i.test(j.status || ''))

  const creativeSamples =
    (
      jarvis.dashboard as {
        creatives?: { id?: string; headline?: string; primary_text?: string; status?: string; funnel?: string }[]
      } | null
    )?.creatives?.slice(0, 4) || []

  if (!cockpit) {
    return (
      <div style={{ padding: 24, color: j2.muted }}>
        <JarvisCore state="THINKING" detail="Loading business state…" size={96} />
      </div>
    )
  }

  const autonomous = (jarvis.dashboard?.autonomous_operator?.attention || []) as {
    severity: string
    system: string
    title: string
    next_action: string
  }[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '10px 10px 4px' : '12px 18px 4px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
              Jarvis operator
            </div>
            <div style={{ fontSize: compact ? 18 : 22, fontWeight: 750, letterSpacing: '-0.04em', marginTop: 4 }}>
              {cockpit.greeting}
            </div>
            <div style={{ color: j2.muted, marginTop: 4, fontSize: 13, lineHeight: 1.4, maxWidth: 560 }}>
              {cockpit.brief}
            </div>
          </div>
          <div style={{ fontSize: 11, color: j2.muted, textAlign: 'right', flexShrink: 0 }}>
            {cockpit.date_label}
            <div>{cockpit.timezone}</div>
            <div style={{ marginTop: 6 }}>
              Meta {execution?.live_meta_execution ? 'LIVE' : 'OFF'} · IG{' '}
              {execution?.live_instagram_publishing ? 'LIVE' : 'OFF'}
            </div>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.1fr) minmax(280px, 0.7fr)',
            gap: compact ? 12 : 16,
            marginTop: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...glassPanel, padding: compact ? 16 : 22 }}>
              <JarvisCore state={core.state} detail={core.detail} size={compact ? 96 : 128} />
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'center',
                  marginTop: 16,
                }}
              >
                {OPERATOR_QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    style={{
                      ...ghostBtn,
                      borderColor: j2.glassBorder,
                      background: 'rgba(255,255,255,0.02)',
                      fontSize: 12,
                    }}
                    onClick={() => void jarvis.sendMessage(a.prompt)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <JarvisVoiceButton jarvis={jarvis} compact={compact} />
            <JarvisConversation jarvis={jarvis} compact={compact} />

            {latestReadyVideo ? (
              <JarvisVideoResult
                video={{
                  title: latestReadyVideo.title || 'Rendered video',
                  duration: latestReadyVideo.duration,
                  aspect_ratio: latestReadyVideo.aspect_ratio,
                  status: latestReadyVideo.status,
                  cost: latestReadyVideo.cost,
                  publishing_enabled: Boolean(execution?.live_instagram_publishing),
                }}
                onRevise={() => void jarvis.sendMessage('Revise the latest rendered Reel based on taste and performance.')}
                onVariation={() => void jarvis.sendMessage('Create a variation of the latest rendered Reel.')}
                onDetails={() => onNavigate('video')}
              />
            ) : null}

            {creativeSamples.length ? (
              <JarvisCreativeGallery
                creatives={creativeSamples.map((c, i) => ({
                  id: c.id || `creative-${i}`,
                  headline: c.headline,
                  primary_text: c.primary_text,
                  funnel: c.funnel,
                  status: c.status,
                }))}
                publishingEnabled={Boolean(execution?.live_meta_execution)}
                onRevise={(id) => void jarvis.sendMessage(`Revise creative ${id} for the ₹99 funnel.`)}
                onVariation={(id) => void jarvis.sendMessage(`Create a variation of creative ${id}.`)}
              />
            ) : null}
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <JarvisBusinessPulse metrics={cockpit.metrics} onNavigate={onNavigate} compact={compact} />
            <JarvisAttention
              items={cockpit.attention || []}
              autonomous={autonomous}
              onNavigate={onNavigate}
              onAsk={(p) => void jarvis.sendMessage(p)}
            />
            <JarvisCostStatus spentUsd={spent} limitUsd={limit} paused={budgetExhausted} />
            <JarvisSystemStatus dashboard={jarvis.dashboard} compact={compact} />
            <div style={{ ...glassPanel, padding: 12, fontSize: 12, color: j2.muted, lineHeight: 1.45 }}>
              Specialized workspaces stay available for deep work — video, creatives, Instagram intel, content ops,
              learning, and settings.
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    ['video', 'Video'],
                    ['creatives', 'Creatives'],
                    ['content_ops', 'Content'],
                    ['approvals', 'Approvals'],
                    ['settings', 'Settings'],
                  ] as const
                ).map(([view, label]) => (
                  <button key={view} type="button" style={{ ...ghostBtn, padding: '4px 8px', fontSize: 11 }} onClick={() => onNavigate(view)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div style={{ ...composerDock }}>
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
