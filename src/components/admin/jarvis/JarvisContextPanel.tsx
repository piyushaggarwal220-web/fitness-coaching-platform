'use client'

/**
 * Contextual right panel — swaps content by Jarvis core state.
 * Keeps permanent dashboard cards off the home surface.
 */

import type { ReactNode } from 'react'
import type { CockpitMetric, AttentionItem } from '@/lib/jarvis/operator-cockpit'
import type { JarvisCoreState } from '@/lib/jarvis/operator-present'
import type { ApprovalCard, CommandView, JarvisDashboard } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { JarvisBusinessPulse } from './JarvisBusinessPulse'
import { JarvisAttention } from './JarvisAttention'
import { JarvisApprovalCard } from './JarvisApprovalCard'
import { JarvisOperationTimeline } from './JarvisOperationTimeline'
import { JarvisVideoResult } from './JarvisVideoResult'
import { JarvisCreativeGallery } from './JarvisCreativeGallery'
import { JarvisCostStatus } from './JarvisCostStatus'
import { j2 } from './styles'

export function JarvisContextPanel({
  mode,
  jarvis,
  metrics,
  attention,
  autonomous,
  onNavigate,
  compact,
}: {
  mode: JarvisCoreState
  jarvis: JarvisCommandState
  metrics: CockpitMetric[]
  attention: AttentionItem[]
  autonomous?: { severity: string; system: string; title: string; next_action: string }[]
  onNavigate: (view: CommandView) => void
  compact?: boolean
}) {
  const pending = jarvis.pendingApprovals[0] as ApprovalCard | undefined
  const spent = (jarvis.dashboard?.cost as { daily_spent_usd?: number } | undefined)?.daily_spent_usd
  const limit = (jarvis.dashboard?.cost as { daily_limit_usd?: number } | undefined)?.daily_limit_usd
  const videoJobs = (
    jarvis.dashboard?.video_workspace as
      | { recent_jobs?: { title?: string; status?: string; duration?: string; aspect_ratio?: string; cost?: string }[] }
      | undefined
  )?.recent_jobs
  const readyVideo = videoJobs?.find((j) => /ready|complete|rendered/i.test(j.status || ''))
  const creatives =
    (
      jarvis.dashboard as {
        creatives?: { id?: string; headline?: string; primary_text?: string; status?: string; funnel?: string }[]
      } | null
    )?.creatives?.slice(0, 5) || []

  let body: ReactNode

  if (mode === 'WAITING_FOR_APPROVAL' && pending) {
    body = (
      <JarvisApprovalCard
        approval={pending}
        busy={jarvis.busy}
        onDecide={jarvis.decide}
        onRevise={(label) => void jarvis.sendMessage(`Modify this approval: ${label}. Propose a safer alternative.`)}
        compact={compact}
      />
    )
  } else if (mode === 'ERROR') {
    body = (
      <PanelFrame title="Action required">
        <p style={bodyText}>{jarvis.error || 'Something failed. Retry or open diagnostics.'}</p>
        <button type="button" style={linkBtn} onClick={() => onNavigate('diagnostics')}>
          Open diagnostics
        </button>
      </PanelFrame>
    )
  } else if (mode === 'RESEARCHING') {
    body = (
      <PanelFrame title="Research">
        {jarvis.timeline.length ? (
          <JarvisOperationTimeline steps={jarvis.timeline} open />
        ) : (
          <p style={bodyText}>Gathering sources…</p>
        )}
      </PanelFrame>
    )
  } else if (mode === 'CREATING' || mode === 'RENDERING') {
    body = (
      <PanelFrame title={mode === 'RENDERING' ? 'Rendering' : 'Creating'}>
        {jarvis.timeline.length ? <JarvisOperationTimeline steps={jarvis.timeline} open /> : null}
        {readyVideo ? (
          <div style={{ marginTop: 12 }}>
            <JarvisVideoResult
              video={{
                title: readyVideo.title || 'Rendered video',
                duration: readyVideo.duration,
                aspect_ratio: readyVideo.aspect_ratio,
                status: readyVideo.status,
                cost: readyVideo.cost,
                publishing_enabled: Boolean(jarvis.dashboard?.execution?.live_instagram_publishing),
              }}
              onRevise={() => void jarvis.sendMessage('Revise the latest rendered Reel.')}
              onVariation={() => void jarvis.sendMessage('Create a variation of the latest Reel.')}
              onDetails={() => onNavigate('video')}
            />
          </div>
        ) : null}
        {creatives.length && mode === 'CREATING' ? (
          <div style={{ marginTop: 12 }}>
            <JarvisCreativeGallery
              creatives={creatives.map((c, i) => ({
                id: c.id || `c-${i}`,
                headline: c.headline,
                primary_text: c.primary_text,
                funnel: c.funnel,
                status: c.status,
              }))}
              publishingEnabled={Boolean(jarvis.dashboard?.execution?.live_meta_execution)}
            />
          </div>
        ) : null}
      </PanelFrame>
    )
  } else if (mode === 'THINKING' || mode === 'OBSERVING' || mode === 'PLANNING' || mode === 'EXECUTING' || mode === 'VERIFYING') {
    body = (
      <PanelFrame title="Operation">
        {jarvis.timeline.length ? (
          <JarvisOperationTimeline steps={jarvis.timeline} open />
        ) : (
          <p style={bodyText}>Working through the request…</p>
        )}
      </PanelFrame>
    )
  } else if (mode === 'COMPLETED' && readyVideo) {
    body = (
      <JarvisVideoResult
        video={{
          title: readyVideo.title || 'Video ready',
          duration: readyVideo.duration,
          aspect_ratio: readyVideo.aspect_ratio,
          status: readyVideo.status,
          publishing_enabled: Boolean(jarvis.dashboard?.execution?.live_instagram_publishing),
        }}
        onApprove={pending ? () => jarvis.decide(pending.id, true) : undefined}
        onRevise={() => void jarvis.sendMessage('Revise the latest rendered Reel.')}
        onVariation={() => void jarvis.sendMessage('Create a variation of the latest Reel.')}
      />
    )
  } else if (mode === 'IDLE' || mode === 'PAUSED' || mode === 'COMPLETED') {
    // IDLE / calm states: Business Pulse owns the panel — attention is a compact strip only.
    body = (
      <>
        <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="grid" preferData />
        {(attention.length || autonomous?.length) ? (
          <div style={{ marginTop: 12 }}>
            <JarvisAttention
              items={attention}
              autonomous={autonomous}
              onNavigate={onNavigate}
              onAsk={(p) => void jarvis.sendMessage(p)}
              dense
              embedded
              maxItems={2}
            />
          </div>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <JarvisCostStatus spentUsd={spent} limitUsd={limit} paused={mode === 'PAUSED'} />
        </div>
        <SystemHint dashboard={jarvis.dashboard} />
      </>
    )
  } else if (attention.length || autonomous?.length) {
    body = (
      <>
        <JarvisAttention
          items={attention}
          autonomous={autonomous}
          onNavigate={onNavigate}
          onAsk={(p) => void jarvis.sendMessage(p)}
          dense
          embedded
          maxItems={3}
        />
        <div style={{ marginTop: 10 }}>
          <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="list" preferData />
        </div>
      </>
    )
  } else {
    body = (
      <>
        <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="grid" preferData />
        <div style={{ marginTop: 10 }}>
          <JarvisCostStatus spentUsd={spent} limitUsd={limit} paused={false} />
        </div>
        <SystemHint dashboard={jarvis.dashboard} />
      </>
    )
  }

  return (
    <aside
      style={{
        padding: compact ? 10 : 14,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        background: 'transparent',
        borderLeft: compact ? 'none' : `1px solid ${j2.glassBorder}`,
      }}
      aria-label="Contextual panel"
    >
      {body}
    </aside>
  )
}

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        {title}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

function SystemHint({ dashboard }: { dashboard: JarvisDashboard | null }) {
  const rt = dashboard?.realtime
  const voice = rt?.modalities?.voice_input || rt?.status
  const note = (rt as { note?: string } | undefined)?.note
  return (
    <div style={{ marginTop: 12, fontSize: 11, color: j2.muted, lineHeight: 1.4 }}>
      <div>
        Meta {dashboard?.execution?.live_meta_execution ? 'LIVE' : 'read-only'} · IG{' '}
        {dashboard?.execution?.live_instagram_publishing ? 'LIVE' : 'read-only'}
      </div>
      <div style={{ marginTop: 4 }} title={note || undefined}>
        Voice {voice === 'CONNECTED' ? 'ready' : voice === 'DISABLED' ? 'off' : String(voice || 'unavailable').toLowerCase()}
      </div>
    </div>
  )
}

const bodyText = { margin: 0, fontSize: 13, color: j2.muted, lineHeight: 1.45 } as const
const linkBtn = {
  marginTop: 10,
  background: 'none' as const,
  border: 'none' as const,
  color: j2.amber,
  fontSize: 12,
  cursor: 'pointer' as const,
  padding: 0,
}
