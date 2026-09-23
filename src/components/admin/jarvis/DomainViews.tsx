'use client'

import type { ReactNode } from 'react'

import { colors } from '@/lib/design-tokens'
import { DOMAIN_COMMANDS, formatInr } from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { Sparkline } from './Sparkline'
import { FootageAttachStrip } from './FootageAttachStrip'
import { analyzePromptForFootage, useFootageUpload } from './use-footage-upload'
import * as s from './styles'

function Panel({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: ReactNode
}) {
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>{kicker}</div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 22, letterSpacing: '-0.03em' }}>{title}</h2>
      {children}
    </div>
  )
}

function HonestEmpty({ domain, reason }: { domain: string; reason: string }) {
  return (
    <div style={s.card}>
      <div style={{ fontWeight: 650 }}>{domain}</div>
      <p style={{ ...s.muted, marginBottom: 0 }}>{reason}</p>
    </div>
  )
}

function VideoFootageIngest({
  jarvis,
  onAsk,
}: {
  jarvis: JarvisCommandState
  onAsk: (q: string) => void
}) {
  const footage = useFootageUpload({
    reloadDashboard: () => jarvis.loadDashboard(),
    onReady: (ready) => {
      jarvis.setInput(analyzePromptForFootage(ready))
    },
  })

  return (
    <div style={{ marginBottom: 14 }}>
      {footage.fileInput}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          style={{
            ...s.solidBtn,
            padding: '7px 12px',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={footage.openPicker}
          disabled={footage.busy || jarvis.busy}
        >
          {footage.busy ? 'Uploading…' : 'Attach footage'}
        </button>
        <span style={s.muted}>mp4 · mov · webm · m4v → private session via /api/admin/jarvis/video-sources</span>
      </div>
      <FootageAttachStrip
        state={footage.state}
        onUpload={() => void footage.uploadSelected()}
        onClear={footage.clear}
        onUseInCommand={() => {
          if (footage.state.status !== 'ready') return
          onAsk(
            analyzePromptForFootage({
              filename: footage.state.filename,
              sessionId: footage.state.sessionId,
              sourceRef: footage.state.sourceRef,
              sourceId: footage.state.sourceId,
            })
          )
        }}
      />
    </div>
  )
}

export function RevenueView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const cockpit = jarvis.dashboard?.cockpit
  const shopify = jarvis.dashboard?.pulse?.shopify
  return (
    <Panel kicker="Business" title="Revenue">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {(cockpit?.metrics ?? []).filter((m) => m.source === 'LURVOX').map((m) => (
          <div key={m.id} style={s.card}>
            <div style={s.eyebrow}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{m.display}</div>
            <div style={s.muted}>{m.change_label || m.period}</div>
          </div>
        ))}
      </div>
      {cockpit?.charts.revenue_7d.length ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.eyebrow}>7-day LURVOX revenue</div>
          <Sparkline points={cockpit.charts.revenue_7d} width={420} height={64} label="₹" />
        </div>
      ) : null}
      <div style={{ ...s.sectionLabel, marginLeft: 0 }}>By plan today</div>
      {cockpit?.by_plan.length ? (
        cockpit.by_plan.map((p) => (
          <div key={p.plan_slug} style={{ ...s.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{p.label}</span>
            <span>
              {formatInr(p.gross_inr)} · {p.paid_count} sales
            </span>
          </div>
        ))
      ) : (
        <div style={s.muted}>No paid plan mix for today.</div>
      )}
      <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Shopify store (not LURVOX checkout)</div>
      <div style={s.card}>
        {shopify?.connected ? (
          <div style={s.muted}>
            {shopify.orders != null ? `${shopify.orders} store orders` : 'Order count unavailable'}
            {shopify.revenue != null ? ` · ${formatInr(shopify.revenue)}` : ''}
          </div>
        ) : (
          <div style={s.muted}>{shopify?.unavailable_reason || 'Shopify store not connected.'}</div>
        )}
      </div>
      <button type="button" style={{ ...s.primaryBtn, marginTop: 16 }} onClick={() => onAsk('Analyze my revenue today.')}>
        Ask Jarvis to analyze revenue
      </button>
    </Panel>
  )
}

export function FunnelsView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const funnels = jarvis.dashboard?.pulse?.funnel_health ?? []
  return (
    <Panel kicker="Business" title="Funnels">
      {funnels.length ? (
        funnels.map((f) => (
          <div key={String(f.funnel_id)} style={{ ...s.card, marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {f.funnel_name}
              {f.price_inr != null ? ` · ₹${f.price_inr.toLocaleString('en-IN')}` : ''}
            </div>
            {f.available ? (
              <div style={{ ...s.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>Spend {f.spend.display}</span>
                <span>Purchases {f.purchases.display}</span>
                <span>CPA {f.cpa.display}</span>
                <span>ROAS {f.roas.display}</span>
              </div>
            ) : (
              <div style={s.muted}>{f.spend.hint}</div>
            )}
          </div>
        ))
      ) : (
        <div style={s.muted}>No funnel records loaded.</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {DOMAIN_COMMANDS.filter((c) => c.id.startsWith('funnel')).map((c) => (
          <button key={c.id} type="button" style={s.ghostBtn} onClick={() => onAsk(c.prompt)}>
            {c.label}
          </button>
        ))}
      </div>
    </Panel>
  )
}

export function MarketingView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const metrics = (jarvis.dashboard?.cockpit?.metrics ?? []).filter((m) => m.source === 'META')
  const ads = jarvis.dashboard?.cockpit?.charts.ads_7d
  return (
    <Panel kicker="Marketing" title="Meta Ads">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {metrics.map((m) => (
          <div key={m.id} style={s.card}>
            <div style={s.eyebrow}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{m.display}</div>
            <div style={s.muted}>{m.hint}</div>
          </div>
        ))}
      </div>
      {ads && ads.length > 1 ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.eyebrow}>Ad spend · 7D</div>
          <Sparkline points={ads} width={420} height={64} label="₹" />
        </div>
      ) : (
        <div style={{ ...s.muted, marginTop: 12 }}>No Meta spend series for the last 7 days.</div>
      )}
      <p style={{ ...s.muted, maxWidth: 640 }}>
        Meta ad spend is never treated as revenue. Live Meta execution stays off unless separately enabled.
      </p>
      <button type="button" style={s.primaryBtn} onClick={() => onAsk('How much did I spend on Meta ads today?')}>
        Check ads
      </button>
    </Panel>
  )
}

export function PlaceholderDomain({
  kicker,
  title,
  reason,
  ask,
  onAsk,
}: {
  kicker: string
  title: string
  reason: string
  ask: string
  onAsk: (q: string) => void
}) {
  return (
    <Panel kicker={kicker} title={title}>
      <HonestEmpty domain={title} reason={reason} />
      <button type="button" style={{ ...s.primaryBtn, marginTop: 12 }} onClick={() => onAsk(ask)}>
        Ask Jarvis
      </button>
    </Panel>
  )
}

export function DomainView({
  view,
  jarvis,
  onAsk,
}: {
  view: CommandView
  jarvis: JarvisCommandState
  onAsk: (q: string) => void
}) {
  if (view === 'revenue') return <RevenueView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'funnels') return <FunnelsView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'marketing') return <MarketingView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'customers') {
    return (
      <PlaceholderDomain
        kicker="Business"
        title="Customers"
        reason="Jarvis does not have a verified customer source of truth yet. No numbers are shown."
        ask="What do we know about customers today?"
        onAsk={onAsk}
      />
    )
  }
  if (view === 'growth') {
    return (
      <PlaceholderDomain
        kicker="Business"
        title="Growth"
        reason="There is no verified growth metric catalogued for Jarvis. Ask for a qualitative read instead of invented KPIs."
        ask="What should I focus on for growth?"
        onAsk={onAsk}
      />
    )
  }
  if (view === 'creatives') {
    const cd = jarvis.dashboard?.creative_director
    const plans = cd?.plans || []
    return (
      <Panel kicker="Creative Director" title="Creatives">
        <p style={s.muted}>
          {cd?.note ||
            'Phase 5 turns footage opportunities into hooks, scripts, and source maps. Never auto-publishes or renders.'}
        </p>
        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Creative plans</div>
        {plans.length === 0 ? (
          <div style={s.muted}>
            No creative plans yet. Analyze a session, then ask Jarvis to plan creatives from footage.
          </div>
        ) : (
          plans.slice(0, 8).map((p) => (
            <div key={p.id} style={{ ...s.card, marginBottom: 8 }}>
              <div style={{ fontWeight: 650 }}>{p.title}</div>
              <div style={s.muted}>
                {(p.status || '').toUpperCase()} · v{p.version} · {p.objective || '—'} ·{' '}
                {p.estimated_duration_sec != null ? `${Number(p.estimated_duration_sec).toFixed(0)}s` : '—'} ·{' '}
                {(p.confidence || '').toUpperCase() || '—'}
              </div>
              {p.hook ? <div style={{ ...s.muted, marginTop: 4 }}>Hook: {p.hook.slice(0, 120)}</div> : null}
            </div>
          ))
        )}
        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Workspace</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            style={s.primaryBtn}
            onClick={() =>
              onAsk(
                'I uploaded today’s footage. What can we make? Use video session + creative.plan. Do not publish or render.'
              )
            }
          >
            From today’s footage
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'I want a Reel about belly fat. Search footage and create a creative draft with source mapping. Do not publish.'
              )
            }
          >
            Idea → footage
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'Give me 5 diversified Reels from the latest analyzed session via creative.plan_batch. Show distribution. Do not publish.'
              )
            }
          >
            Batch of 5
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('List creative plans with status, hook, objective, and missing footage. Not a publish action.')
            }
          >
            List plans
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'For the latest creative draft: I don’t like the hook. Revise only the hook with creative.revise.'
              )
            }
          >
            Revise hook
          </button>
        </div>
      </Panel>
    )
  }
  if (view === 'instagram') {
    const ig = jarvis.dashboard?.instagram_intelligence
    const fmt = (n: number | null | undefined) =>
      n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1)
    return (
      <Panel kicker="Marketing" title="Instagram">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={s.card}>
            <div style={s.eyebrow}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              {ig?.configured ? 'Connected' : 'Not configured'}
            </div>
            <div style={s.muted}>
              {ig?.live_publishing_enabled ? 'Live publish enabled' : 'Publishing gated (off)'}
            </div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Followers</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{fmt(ig?.followers ?? null)}</div>
            <div style={s.muted}>From last sync snapshot</div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Posts synced</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{fmt(ig?.posts_synced ?? null)}</div>
            <div style={s.muted}>Catalog rows</div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Median reach</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{fmt(ig?.reach_median ?? null)}</div>
            <div style={s.muted}>Verified snapshots only</div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Median interactions</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {fmt(ig?.interactions_median ?? null)}
            </div>
            <div style={s.muted}>total_interactions</div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Latest sync</div>
            <div style={{ fontSize: 14, fontWeight: 650, marginTop: 4 }}>
              {ig?.latest_sync_status || '—'}
            </div>
            <div style={s.muted}>{ig?.latest_sync_at || 'Not synced yet'}</div>
          </div>
        </div>
        <p style={{ ...s.muted, marginTop: 12 }}>
          {ig?.data_coverage_note ||
            'Run Instagram sync (read-only) to build historical content intelligence. Unavailable metrics stay blank — never zero.'}
        </p>
        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Content intelligence</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            style={s.primaryBtn}
            onClick={() => onAsk('Sync Instagram content read-only and analyze historical performance.')}
          >
            Sync & analyze
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'Plan tomorrow\'s Instagram content: give me 5 reel ideas based on what has historically worked. Separate first-party evidence from research.'
              )
            }
          >
            Plan next posts
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('Generate 5 Instagram reel ideas using first-party performance evidence. Mark confidence honestly if sample size is small.')
            }
          >
            Generate ideas
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('Take the latest Instagram content idea and generate a complete video draft with script, shot list, and captions. Do not publish.')
            }
          >
            Generate draft
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() => onAsk('Show recent Instagram content plans and drafts from marketing_content.')}
          >
            Recent content
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('Summarize historical Instagram evidence: sample size, strongest patterns, data limitations. Do not claim guaranteed performance.')
            }
          >
            Historical evidence
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('Research current fitness Reel trends for India audience. Separate external research from our first-party data.')
            }
          >
            Research evidence
          </button>
        </div>
      </Panel>
    )
  }
  if (view === 'video') {
    const vw = jarvis.dashboard?.video_workspace
    const jobs = vw?.recent_jobs ?? []
    const sessions = vw?.sessions ?? []
    const intel = vw?.intelligence
    const providerLabel =
      vw?.provider === 'shotstack' ? 'Shotstack' : vw?.provider || 'stub'
    const connected =
      vw?.provider_configured && (vw?.provider_kind === 'REAL' || vw?.provider_kind === 'TEST')
    return (
      <Panel kicker="Marketing" title="Video">
        <VideoFootageIngest jarvis={jarvis} onAsk={onAsk} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <div style={s.card}>
            <div style={s.eyebrow}>Edit provider</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{providerLabel}</div>
            <div style={s.muted}>
              {connected ? 'Connected' : 'Unavailable'}
              {vw?.provider_kind ? ` · ${vw.provider_kind}` : ''}
            </div>
          </div>
          <div style={s.card}>
            <div style={s.eyebrow}>Intelligence</div>
            <div style={{ fontSize: 14, fontWeight: 650, marginTop: 4 }}>
              {intel?.configured ? intel.provider : 'NOT CONFIGURED'}
            </div>
            <div style={s.muted}>{intel?.note || 'Separate from Shotstack render.'}</div>
          </div>
        </div>
        {(vw?.missing?.length ?? 0) > 0 ? (
          <p style={{ ...s.muted, marginTop: 12 }}>
            Missing edit config: {(vw?.missing ?? []).join(', ')}
          </p>
        ) : null}
        {(intel?.missing?.length ?? 0) > 0 ? (
          <p style={{ ...s.muted, marginTop: 8 }}>
            Missing intelligence config: {(intel?.missing ?? []).join(', ')}
          </p>
        ) : null}

        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Content sessions</div>
        {sessions.length === 0 ? (
          <div style={s.muted}>
            No sessions yet. Use Attach footage above — creates a session, stores the private source, then ask Jarvis to
            video.analyze.
          </div>
        ) : (
          sessions.slice(0, 6).map((sess) => (
            <div key={sess.id} style={{ ...s.card, marginBottom: 8 }}>
              <div style={{ fontWeight: 650 }}>{sess.title}</div>
              <div style={s.muted}>
                {(sess.status || '').toUpperCase()} · {sess.source_count ?? 0} sources ·{' '}
                {Number(sess.total_duration_sec || 0).toFixed(0)}s · {sess.opportunity_count ?? 0}{' '}
                opportunities
              </div>
            </div>
          ))
        )}

        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Editor (Phase 6 EDL)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 }}>
          <button
            type="button"
            style={s.primaryBtn}
            onClick={() =>
              onAsk(
                'Take the latest creative plan and create an EDL with video.create_edl. Show exact source timestamps. Do not invent footage. Do not publish.'
              )
            }
          >
            Generate EDL
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'Validate the latest EDL with video.validate_edl, then render with video.render_edl if READY. Respect cost governor. Do not publish.'
              )
            }
          >
            Render EDL
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'For the latest EDL: remove the zoom and make the hook faster. Keep everything else the same. Use video.revise_edl and show the EDL diff. Do not auto-render unless I ask.'
              )
            }
          >
            Revise (keep rest)
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'List recent renders with EDL version provenance via video.list_renders. Never claim Instagram publish.'
              )
            }
          >
            Review renders
          </button>
        </div>

        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Workspace</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            style={s.primaryBtn}
            onClick={() =>
              onAsk(
                'Check video.provider_status for Shotstack edit AND video intelligence. Report which capabilities are supported vs unsupported. Do not invent analysis.'
              )
            }
          >
            Provider status
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'List video content sessions with source counts, durations, analysis status, and opportunity counts.'
              )
            }
          >
            Sessions
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'How many Reels can we approximately make from the latest analyzed video session? Use video.session_summary / find_opportunities. Do not invent counts.'
              )
            }
          >
            Approx. Reel count
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'Find footage about belly fat using video.find_sources. Return exact timestamps and transcripts only if they exist.'
              )
            }
          >
            Search footage
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() => onAsk('List recent video edit jobs and their real statuses (QUEUED/RENDERING/COMPLETED/FAILED).')}
          >
            Recent jobs
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk(
                'Turn my latest uploaded gym video into a 30-second Short-form Fitness Reel on Shotstack: 9:16, captions from hooks, center crop. Do not publish.'
              )
            }
          >
            Short-form Fitness Reel
          </button>
          <button
            type="button"
            style={s.ghostBtn}
            onClick={() =>
              onAsk('Prepare the latest rendered reel for Instagram. Do not publish — wait for approval.')
            }
          >
            Prepare for Instagram
          </button>
        </div>
        <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Recent edit jobs</div>
        {jobs.length === 0 ? (
          <div style={s.muted}>
            No video jobs yet. Upload via /api/admin/jarvis/video-sources, then create an edit job with the
            jarvis-video:// source_ref.
          </div>
        ) : (
          jobs.slice(0, 8).map((j) => (
            <div
              key={j.id}
              style={{ ...s.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}
            >
              <div>
                <div style={{ fontWeight: 650 }}>{(j.status || 'unknown').toUpperCase()}</div>
                <div style={s.muted}>
                  {j.preset || 'edit'} · {j.aspect_ratio || '9:16'} · {j.created_at || ''}
                </div>
                {j.provider_job_id ? (
                  <div style={s.muted}>render: {j.provider_job_id}</div>
                ) : null}
                {j.estimated_cost_usd != null ? (
                  <div style={s.muted}>est. ${Number(j.estimated_cost_usd).toFixed(2)}</div>
                ) : null}
                {j.error ? <div style={s.muted}>{j.error}</div> : null}
              </div>
              <div style={s.muted}>
                {j.has_output ? 'output ready' : 'no output'} · {j.approval_status || 'none'}
              </div>
            </div>
          ))
        )}
        <p style={{ ...s.muted, marginTop: 12 }}>
          Intelligence understands footage (when configured). Shotstack renders only. COMPLETED only when
          Shotstack confirms output. Publishing stays approval-gated
          (LIVE_INSTAGRAM_PUBLISHING_ENABLED=false).
        </p>
      </Panel>
    )
  }
  if (view === 'experiments') {
    return (
      <PlaceholderDomain
        kicker="Marketing"
        title="Experiments"
        reason="No experiment results are loaded on this screen unless Jarvis has recorded them in memory or activity."
        ask="What experiments are running?"
        onAsk={onAsk}
      />
    )
  }
  return <div style={{ padding: 20, color: colors.textMuted }}>Unknown view.</div>
}
