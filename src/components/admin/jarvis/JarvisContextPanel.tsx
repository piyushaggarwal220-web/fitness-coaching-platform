'use client'

/**
 * Contextual right panel — swaps content by Jarvis core state.
 * Dense operational context; no permanent giant diagnostic wall.
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

type VideoJobRow = {
  id?: string
  title?: string
  status?: string
  duration?: string
  aspect_ratio?: string
  cost?: string
  has_output?: boolean
  preset?: string
  estimated_cost_usd?: number | null
  actual_cost_usd?: number | null
  approval_status?: string | null
}

function isReadyVideoJob(j: VideoJobRow) {
  if (j.has_output) return true
  return /ready|complete|rendered|awaiting_approval/i.test(j.status || '')
}

function costLabel(j: VideoJobRow) {
  const n = j.actual_cost_usd ?? j.estimated_cost_usd
  return typeof n === 'number' ? `$${n.toFixed(2)}` : j.cost
}

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
    jarvis.dashboard?.video_workspace as { recent_jobs?: VideoJobRow[] } | undefined
  )?.recent_jobs
  const readyVideo = videoJobs?.find(isReadyVideoJob)
  const renderingJob = videoJobs?.find((j) =>
    /render|queued|processing|running|submitted/i.test(j.status || '')
  )
  const creatives =
    (
      jarvis.dashboard as {
        creatives?: { id?: string; headline?: string; primary_text?: string; status?: string; funnel?: string }[]
      } | null
    )?.creatives?.slice(0, 5) || []

  const videoBusy = mode === 'CREATING' || mode === 'RENDERING'
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
  } else if (videoBusy) {
    body = (
      <PanelFrame title={mode === 'RENDERING' ? 'Rendering Reel' : 'Creating Reel'}>
        {jarvis.timeline.length ? (
          <JarvisOperationTimeline steps={jarvis.timeline} open />
        ) : (
          <VideoStageHints mode={mode} status={renderingJob?.status || readyVideo?.status} />
        )}
        {readyVideo?.has_output ? (
          <div style={{ marginTop: 10 }}>
            <JarvisVideoResult
              video={{
                title: readyVideo.title || readyVideo.preset || 'Rendered Reel',
                duration: readyVideo.duration,
                aspect_ratio: readyVideo.aspect_ratio || '9:16',
                status: readyVideo.status,
                cost: costLabel(readyVideo),
                publishing_enabled: Boolean(jarvis.dashboard?.execution?.live_instagram_publishing),
              }}
              onRevise={() => void jarvis.sendMessage('Revise the latest rendered Reel.')}
              onVariation={() => void jarvis.sendMessage('Create a variation of the latest Reel.')}
              onDetails={() => onNavigate('video')}
            />
          </div>
        ) : null}
        {creatives.length && mode === 'CREATING' ? (
          <div style={{ marginTop: 10 }}>
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
  } else if (
    mode === 'THINKING' ||
    mode === 'OBSERVING' ||
    mode === 'PLANNING' ||
    mode === 'EXECUTING' ||
    mode === 'VERIFYING'
  ) {
    body = (
      <PanelFrame title="Current task">
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
          title: readyVideo.title || readyVideo.preset || 'Video ready',
          duration: readyVideo.duration,
          aspect_ratio: readyVideo.aspect_ratio || '9:16',
          status: readyVideo.status,
          cost: costLabel(readyVideo),
          publishing_enabled: Boolean(jarvis.dashboard?.execution?.live_instagram_publishing),
        }}
        onApprove={pending ? () => jarvis.decide(pending.id, true) : undefined}
        onRevise={() => void jarvis.sendMessage('Revise the latest rendered Reel.')}
        onVariation={() => void jarvis.sendMessage('Create a variation of the latest Reel.')}
        onDetails={() => onNavigate('video')}
      />
    )
  } else if (mode === 'IDLE' || mode === 'PAUSED' || mode === 'COMPLETED') {
    body = (
      <>
        <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="grid" preferData />
        {attention.length || autonomous?.length ? (
          <div style={{ marginTop: 10 }}>
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
        <div style={{ marginTop: 8 }}>
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
        <div style={{ marginTop: 8 }}>
          <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="list" preferData />
        </div>
      </>
    )
  } else {
    body = (
      <>
        <JarvisBusinessPulse metrics={metrics} onNavigate={onNavigate} compact layout="grid" preferData />
        <div style={{ marginTop: 8 }}>
          <JarvisCostStatus spentUsd={spent} limitUsd={limit} paused={false} />
        </div>
        <SystemHint dashboard={jarvis.dashboard} />
      </>
    )
  }

  return (
    <aside
      style={{
        padding: compact ? 10 : 12,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        background: 'transparent',
      }}
      aria-label="Contextual panel"
    >
      {body}
    </aside>
  )
}

function VideoStageHints({ mode, status }: { mode: JarvisCoreState; status?: string }) {
  const stages =
    mode === 'RENDERING'
      ? ['Creating edit', 'Rendering', 'Verifying', 'Video ready']
      : [
          'Analyzing footage',
          'Selecting clips',
          'Building story',
          'Planning captions',
          'Creating edit',
          'Rendering',
        ]
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {stages.map((label, i) => (
        <li
          key={label}
          style={{
            fontSize: 12,
            padding: '4px 0',
            color: i === 0 ? j2.text : j2.muted,
          }}
        >
          {i === 0 ? '●' : '○'} {label}
          {i === 0 && status ? (
            <span style={{ color: j2.muted, marginLeft: 6 }}>({status})</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: j2.muted,
          fontWeight: 650,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

function SystemHint({ dashboard }: { dashboard: JarvisDashboard | null }) {
  const rt = dashboard?.realtime
  const voice = rt?.modalities?.voice_input || rt?.status
  const note = (rt as { note?: string } | undefined)?.note
  const video = dashboard?.video_workspace as { provider_configured?: boolean } | undefined
  return (
    <div style={{ marginTop: 10, fontSize: 10, color: j2.muted, lineHeight: 1.4 }}>
      <div>
        Meta {dashboard?.execution?.live_meta_execution ? 'LIVE' : 'read-only'} · IG{' '}
        {dashboard?.execution?.live_instagram_publishing ? 'LIVE' : 'read-only'}
      </div>
      <div style={{ marginTop: 3 }} title={note || undefined}>
        Voice {voice === 'CONNECTED' ? 'ready' : voice === 'DISABLED' ? 'off' : String(voice || 'unavailable').toLowerCase()}
        {' · '}
        Video {video?.provider_configured ? 'ready' : 'check provider'}
      </div>
    </div>
  )
}

const bodyText = { margin: 0, fontSize: 13, color: j2.muted, lineHeight: 1.45 } as const
const linkBtn = {
  marginTop: 8,
  background: 'none' as const,
  border: 'none' as const,
  color: j2.amber,
  fontSize: 12,
  cursor: 'pointer' as const,
  padding: 0,
}
