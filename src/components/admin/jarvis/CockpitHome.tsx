'use client'

import { useMemo, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import {
  formatTime,
  coreStateFromContext,
  humanToolLabel,
} from '@/lib/jarvis/operator-present'
import type { CockpitMetric, ChangeCard, OperatorState } from '@/lib/jarvis/operator-cockpit'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { CommandBar } from './CommandBar'
import { VoiceOperatorPanel } from './VoiceOperatorPanel'
import { ExecutiveChart } from './Sparkline'
import { FootageAttachStrip } from './FootageAttachStrip'
import { analyzePromptForFootage, useFootageUpload } from './use-footage-upload'
import * as s from './styles'

function metricColor(status: CockpitMetric['status']) {
  if (status === 'error') return colors.danger
  if (status === 'unavailable' || status === 'stale') return colors.textMuted
  return colors.textPrimary
}

function changeColor(label: string | null, status: CockpitMetric['status']) {
  if (status === 'unavailable' || status === 'error' || status === 'stale') return colors.textMuted
  if (!label) return colors.textMuted
  if (label.startsWith('+')) return colors.success
  if (label.startsWith('-') && label.includes('%')) return colors.danger
  return colors.textMuted
}

function toneColor(tone: ChangeCard['tone']) {
  if (tone === 'up') return colors.success
  if (tone === 'down' || tone === 'warn') return colors.warning
  return colors.textMuted
}

function stateColor(state: OperatorState) {
  if (state === 'Failed' || state === 'Blocked') return colors.danger
  if (state === 'Waiting for approval') return colors.warning
  if (state === 'Completed' || state === 'Idle') return colors.textMuted
  return colors.success
}

function ownerStateWord(input: {
  busy: boolean
  voice: 'listening' | 'speaking' | 'idle'
  core: string
}): string {
  if (input.voice === 'listening') return 'Listening'
  if (input.voice === 'speaking' || input.busy) return 'Working'
  if (input.core === 'WAITING_FOR_APPROVAL') return 'Needs your OK'
  if (input.core === 'ERROR' || input.core === 'PAUSED') return 'Stopped'
  return 'Done'
}

function spokenBrief(parts: Array<string | null | undefined>): string {
  const text = parts
    .map((p) => (p || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
  return text.length > 420 ? `${text.slice(0, 400).trim()}…` : text
}

function speakChange(label: string | null): string {
  if (!label) return ''
  const vs = label.replace(/\s+vs\s+/i, ' from ')
  if (vs.startsWith('+')) return `, up ${vs.slice(1)}`
  if (vs.startsWith('-')) return `, down ${vs.slice(1)}`
  return `, ${vs}`
}

function openingFromMetrics(metrics: CockpitMetric[]): string[] {
  const revenue = metrics.find((m) => m.id === 'revenue')
  const sales = metrics.find((m) => m.id === 'sales')
  const ads = metrics.find((m) => m.id === 'ad_spend')
  const lines: string[] = []
  if (revenue?.status === 'ok') {
    lines.push(`Today's revenue is ${revenue.display}${speakChange(revenue.change_label)}.`)
  } else if (revenue) {
    lines.push("Today's revenue is unavailable.")
  }
  if (sales?.status === 'ok') lines.push(`${sales.display} paid sales.`)
  if (ads && ads.status !== 'ok') lines.push('Ad spend, CPA, and ROAS have no Meta numbers yet.')
  return lines
}

function reelLines(
  jobs: { status: string; preset?: string | null; has_output?: boolean }[]
): string[] {
  const groups = new Map<string, { count: number; status: string; preset: string; ready: boolean }>()
  for (const job of jobs) {
    const preset = job.preset || 'Reel'
    const key = `${job.status}|${preset}|${job.has_output ? '1' : '0'}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { count: 1, status: job.status, preset, ready: Boolean(job.has_output) })
  }
  return [...groups.values()].map((group) => {
    const name = group.preset.replace(/_/g, ' ')
    const state =
      group.status === 'awaiting_approval' ? 'waiting for your OK' : group.status.replace(/_/g, ' ')
    const noun = group.count === 1 ? name : `${group.count} ${name}s`
    const verb = group.count === 1 ? 'is' : 'are'
    const ready = group.ready ? ' The output is ready.' : ''
    return `${noun} ${verb} ${state}.${ready}`
  })
}

function readAloud(text: string): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1
  window.speechSynthesis.speak(utterance)
  return true
}

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
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [voicePhase, setVoicePhase] = useState<'listening' | 'speaking' | 'idle'>('idle')
  const [readNote, setReadNote] = useState('')

  const footage = useFootageUpload({
    reloadDashboard: () => jarvis.loadDashboard(),
    onReady: (ready) => {
      jarvis.setInput(analyzePromptForFootage(ready))
    },
  })

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

  const videoWs = jarvis.dashboard?.video_workspace
  const videoSessions = (videoWs?.sessions ?? []).slice(0, 3)
  const videoJobs = (videoWs?.recent_jobs ?? []).slice(0, 4)

  if (!cockpit) {
    return (
      <div style={{ padding: 16 }}>
        <div style={s.eyebrow}>Command Center</div>
        <div style={{ marginTop: 6, color: colors.textMuted }}>Loading business state…</div>
      </div>
    )
  }

  const statusTone =
    core.state === 'ERROR' || core.state === 'PAUSED'
      ? colors.danger
      : core.state === 'WAITING_FOR_APPROVAL'
        ? colors.warning
        : core.state === 'IDLE' || core.state === 'COMPLETED'
          ? colors.textMuted
          : colors.success

  const waiting = jarvis.pendingApprovals[0]
  const reelSummary = reelLines(videoJobs)
  const spokenLine = spokenBrief([
    ...openingFromMetrics(cockpit.metrics),
    reelSummary[0] ?? null,
    waiting ? `Waiting on you: ${waiting.action_label}.` : null,
  ]) || cockpit.brief

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '8px 10px 4px' : '8px 16px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: compact ? 16 : 17, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.2 }}>
                {cockpit.greeting}
              </div>
              <span
                style={{
                  ...s.badge(core.state === 'WAITING_FOR_APPROVAL' ? 'warn' : core.state === 'ERROR' ? 'danger' : 'muted'),
                  border: `1px solid ${statusTone}44`,
                }}
                title={core.detail || core.state}
              >
                <span style={{ ...s.statusDot(core.state === 'ERROR' ? 'danger' : core.state === 'WAITING_FOR_APPROVAL' ? 'warn' : core.state === 'IDLE' ? 'muted' : 'ok'), marginRight: 6 }} />
                {ownerStateWord({ busy: jarvis.busy, voice: voicePhase, core: core.state })}
              </span>
            </div>
            <div style={{ color: colors.textSecondary, marginTop: 3, fontSize: 12, lineHeight: 1.35 }}>
              {spokenLine}
            </div>
            <button
              type="button"
              style={{ ...s.ghostBtn, border: 'none', padding: '2px 0', marginTop: 2, color: s.accent, fontSize: 12 }}
              onClick={() => {
                const ok = readAloud(spokenLine)
                setReadNote(ok ? '' : 'This browser cannot read the briefing aloud.')
              }}
            >
              Read this
            </button>
            {readNote ? <div style={{ fontSize: 11, color: colors.warning }}>{readNote}</div> : null}
            {core.state !== 'IDLE' && core.detail ? (
              <div style={{ marginTop: 4, fontSize: 11, color: statusTone }}>
                {activeTool ? humanToolLabel(activeTool) : core.detail}
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 10, color: colors.textMuted, textAlign: 'right', flexShrink: 0, lineHeight: 1.3 }}>
            {cockpit.date_label}
            <div>{cockpit.timezone}</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(6, minmax(0, 1fr))',
            marginTop: 8,
            borderTop: `1px solid ${colors.borderSubtle}`,
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          {cockpit.metrics.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onNavigate(m.view)}
              style={{
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderLeft: !compact && i > 0 ? `1px solid ${colors.divider}` : 'none',
                padding: '6px 8px',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: colors.textMuted, textTransform: 'uppercase' }}>
                {m.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: metricColor(m.status), letterSpacing: '-0.03em' }}>
                {m.display}
              </div>
              <div style={{ fontSize: 10, marginTop: 2, color: changeColor(m.change_label, m.status) }}>
                {m.change_label || m.period}
              </div>
              <div style={{ fontSize: 9, marginTop: 1, color: colors.textMuted, letterSpacing: '0.04em' }}>
                {m.source} · {m.status_label}
              </div>
            </button>
          ))}
        </div>

        {waiting ? (
          <div
            style={{
              marginTop: 8,
              padding: '8px 0',
              borderBottom: `1px solid ${colors.divider}`,
            }}
          >
            <div style={s.sectionLabel}>Needs your OK</div>
            <div style={{ fontSize: 13, fontWeight: 650, marginTop: 4 }}>{waiting.action_label}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{waiting.reason}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={s.solidBtn}
                disabled={jarvis.busy}
                onClick={() => void jarvis.decide(waiting.id, true)}
              >
                Approve
              </button>
              <button
                type="button"
                style={s.dangerBtn}
                disabled={jarvis.busy}
                onClick={() => void jarvis.decide(waiting.id, false)}
              >
                Reject
              </button>
              {jarvis.pendingApprovals.length > 1 ? (
                <button
                  type="button"
                  style={s.ghostBtn}
                  onClick={() => onNavigate('approvals')}
                >
                  See all {jarvis.pendingApprovals.length}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 8,
            paddingBottom: 6,
            borderBottom: `1px solid ${colors.divider}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={s.sectionLabel}>Video operations</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, color: s.accent, fontSize: 11 }}
                onClick={footage.openPicker}
                disabled={footage.busy || jarvis.busy}
              >
                {footage.busy ? 'Uploading…' : 'Attach footage'}
              </button>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, fontSize: 11 }}
                onClick={() => onNavigate('video')}
              >
                Open video →
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            {videoWs?.provider_configured ? 'Rendering is connected.' : 'Rendering is not connected yet.'}
          </div>
          {videoSessions.length ? (
            videoSessions.map((sess) => (
              <div key={sess.id} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                <span style={{ fontWeight: 650 }}>{sess.title}</span>
                {sess.source_count != null ? ` · ${sess.source_count} file${sess.source_count === 1 ? '' : 's'}` : ''}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, marginTop: 4, color: colors.textMuted }}>No footage attached yet.</div>
          )}
          {reelSummary.map((line) => (
            <div key={line} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
              {line}
            </div>
          ))}
        </div>

        {jarvis.timeline.length ? (
          <div style={{ marginTop: 8, paddingBottom: 6, borderBottom: `1px solid ${colors.divider}` }}>
            <div style={s.sectionLabel}>Live operation</div>
            {jarvis.timeline.slice(0, 6).map((step) => (
              <div key={step.id} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                <span
                  style={{
                    color:
                      step.state === 'active'
                        ? colors.success
                        : step.state === 'error'
                          ? colors.danger
                          : colors.textMuted,
                    fontWeight: 650,
                  }}
                >
                  {step.state}
                </span>
                {' · '}
                {step.label}
                {step.detail ? ` · ${step.detail}` : ''}
              </div>
            ))}
          </div>
        ) : null}

        {jarvis.dashboard?.events?.recent?.length ? (
          <div style={{ marginTop: 8, paddingBottom: 6, borderBottom: `1px solid ${colors.divider}` }}>
            <div style={s.sectionLabel}>Signals</div>
            {(jarvis.dashboard.events.summary_lines || [])
              .slice(0, 4)
              .map((line) => (
                <div key={line} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                  {line}
                </div>
              ))}
            {!jarvis.dashboard.events.summary_lines?.length
              ? jarvis.dashboard.events.recent.slice(0, 4).map((e) => (
                  <div key={e.id} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                    {e.event_type} · {e.significance || e.status}
                    {e.funnel_id ? ` · ${e.funnel_id}` : ''}
                  </div>
                ))
              : null}
          </div>
        ) : null}

        {jarvis.dashboard?.strategic_memory ? (
          <div style={{ marginTop: 8, paddingBottom: 6, borderBottom: `1px solid ${colors.divider}` }}>
            <div style={s.sectionLabel}>Strategic intelligence</div>
            {(jarvis.dashboard.strategic_memory.patterns || []).slice(0, 3).map((p) => (
              <div key={p} style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                {p}
              </div>
            ))}
            {(jarvis.dashboard.strategic_memory.open_questions || []).slice(0, 2).map((q) => (
              <div key={q} style={{ fontSize: 12, marginTop: 4, color: colors.textMuted }}>
                Open: {q}
              </div>
            ))}
            {(jarvis.dashboard.strategic_memory.stale_assumptions || []).slice(0, 2).map((q) => (
              <div key={q} style={{ fontSize: 12, marginTop: 4, color: colors.textMuted }}>
                Stale: {q}
              </div>
            ))}
            {(jarvis.dashboard.strategic_memory.conflicts || []).slice(0, 2).map((c) => (
              <div key={c.id || c.reason} style={{ fontSize: 12, marginTop: 4, color: colors.warning }}>
                Conflict: {c.reason.slice(0, 140)}
              </div>
            ))}
            {!jarvis.dashboard.strategic_memory.patterns?.length &&
            !jarvis.dashboard.strategic_memory.conflicts?.length ? (
              <div style={{ fontSize: 12, marginTop: 4, color: colors.textMuted }}>
                {jarvis.dashboard.strategic_memory.note || 'No active strategic patterns yet.'}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr 1fr',
            gap: compact ? 10 : 14,
            marginTop: 8,
            paddingBottom: 6,
            borderBottom: `1px solid ${colors.divider}`,
          }}
        >
          <div>
            <div style={s.sectionLabel}>Revenue · 7D</div>
            {cockpit.charts.revenue_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.revenue_7d} unit="₹" height={48} />
            ) : (
              <div style={s.muted}>No verified LURVOX points for this period.</div>
            )}
          </div>
          <div>
            <div style={s.sectionLabel}>Paid sales · 7D</div>
            {cockpit.charts.sales_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.sales_7d} height={48} />
            ) : (
              <div style={s.muted}>No verified LURVOX points for this period.</div>
            )}
          </div>
          <div>
            <div style={s.sectionLabel}>Meta performance</div>
            {cockpit.charts.ads_7d && cockpit.charts.ads_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.ads_7d} unit="₹" height={48} />
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 650, color: colors.textMuted, marginTop: 1 }}>Unavailable</div>
                <div style={s.muted}>{cockpit.charts.meta_unavailable || 'No verified marketing_performance rows for this period.'}</div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1.15fr',
            gap: compact ? 12 : 16,
            marginTop: 8,
            paddingBottom: 4,
          }}
        >
          <section>
            <div style={s.sectionLabel}>What changed</div>
            {cockpit.changes.length ? (
              cockpit.changes.map((c) => (
                <div key={c.id} style={{ padding: '3px 0', borderBottom: `1px solid ${colors.divider}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                    <span style={{ fontWeight: 650 }}>
                      <span style={{ color: toneColor(c.tone), marginRight: 6 }}>●</span>
                      {c.title}
                    </span>
                    <span style={{ color: colors.textMuted, fontSize: 10, letterSpacing: '0.06em' }}>{c.source}</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{c.why}</div>
                  {c.impact ? <div style={{ ...s.muted, marginTop: 0, fontSize: 11 }}>{c.impact}</div> : null}
                </div>
              ))
            ) : (
              <div style={s.muted}>No material changes.</div>
            )}
          </section>

          <section>
            <div style={s.sectionLabel}>Jarvis insight</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: colors.textSecondary }}>
              {cockpit.insight.text || 'No insight available.'}
            </p>
            <div style={{ ...s.muted, marginTop: 4, fontSize: 11 }}>{cockpit.insight.evidence_line}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, color: s.accent, fontSize: 12 }}
                onClick={() =>
                  void jarvis.sendMessage(
                    cockpit.insight.text.includes('Meta')
                      ? 'Investigate why Meta data is missing.'
                      : 'Investigate what happened in the business today.'
                  )
                }
              >
                Investigate
              </button>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, fontSize: 12 }}
                onClick={() => setEvidenceOpen((v) => !v)}
              >
                {evidenceOpen ? 'Hide evidence' : 'Show evidence'}
              </button>
            </div>
            {evidenceOpen ? (
              <div style={{ marginTop: 4 }}>
                {cockpit.insight.sources.map((src) => (
                  <div key={src.label} style={{ ...s.muted, marginTop: 2, fontSize: 11 }}>
                    {src.label} · {src.detail}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
            gap: compact ? 12 : 16,
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1px solid ${colors.divider}`,
          }}
        >
          <section>
            <div style={s.sectionLabel}>Jarvis is working on</div>
            {cockpit.operator_timeline.length ? (
              cockpit.operator_timeline.map((event) => (
                <div key={event.id} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                  <span style={{ color: stateColor(event.state), marginTop: 2 }}>●</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 650 }}>{event.state}</div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>{event.title}</div>
                    <div style={s.muted}>
                      {event.at ? formatTime(event.at) : event.detail}
                      {event.at && event.detail ? ` · ${event.detail}` : ''}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={s.muted}>No operator activity yet.</div>
            )}
          </section>

          <section>
            <div style={s.sectionLabel}>Jarvis recommends</div>
            {cockpit.recommendations.length ? (
              cockpit.recommendations.map((r) => (
                <div key={r.id} style={{ padding: '2px 0 6px' }}>
                  <div style={{ fontSize: 13, fontWeight: 650 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>Why · {r.problem}</div>
                  <div style={s.muted}>Evidence · {r.evidence}</div>
                  <div style={s.muted}>Risk · {r.risk}</div>
                  <button
                    type="button"
                    style={{ ...s.ghostBtn, border: 'none', padding: 0, marginTop: 4, color: s.accent }}
                    onClick={() =>
                      void jarvis.sendMessage(
                        r.action_type === 'Investigate'
                          ? 'Investigate why Meta data is missing.'
                          : `Review this recommendation: ${r.title}. Evidence: ${r.evidence}`
                      )
                    }
                  >
                    {r.action_type}
                  </button>
                </div>
              ))
            ) : (
              <div style={s.muted}>Jarvis has no action recommendation right now.</div>
            )}
          </section>
        </div>
      </div>

      <div style={s.composerDock}>
        {footage.fileInput}
        <FootageAttachStrip
          state={footage.state}
          onUpload={() => void footage.uploadSelected()}
          onClear={footage.clear}
          onUseInCommand={() => {
            if (footage.state.status !== 'ready') return
            const prompt = analyzePromptForFootage({
              filename: footage.state.filename,
              sessionId: footage.state.sessionId,
              sourceRef: footage.state.sourceRef,
              sourceId: footage.state.sourceId,
            })
            void jarvis.sendMessage(prompt)
          }}
        />
        <VoiceOperatorPanel
          conversationId={jarvis.conversationId}
          busy={jarvis.busy}
          onPresence={setVoicePhase}
          onVoiceResult={(result) => {
            jarvis.ingestVoiceResult(result)
            if (result.conversationId || result.assistantText) {
              jarvis.setView('chat')
            }
          }}
        />
        <CommandBar
          value={jarvis.input}
          onChange={jarvis.setInput}
          onSubmit={(text) => void jarvis.sendMessage(text)}
          busy={jarvis.busy || footage.busy}
          placeholder="Ask Jarvis…"
          voiceStatus={voiceStatus}
          voiceTitle={voiceTitle}
          showChips
          onAttach={footage.openPicker}
          attachTitle={footage.busy ? 'Uploading footage…' : 'Attach raw footage (private ingest)'}
          attachDisabled={footage.busy || jarvis.busy}
          attachBusy={footage.busy}
        />
      </div>
    </div>
  )
}
