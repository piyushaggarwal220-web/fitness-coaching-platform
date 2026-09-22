'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import * as s from './styles'

type Overview = {
  last_research_run: string | null
  freshness: string | null
  scope: string | null
  geography: string | null
  sample_size: number
  limitations: string[]
  watchlists: number
  opportunities: number
  external_graph: string
  discovery_method: string
}

const SECTIONS = [
  'Overview',
  'Viral Reels',
  'Creators',
  'Trends',
  'Content Gaps',
  'Research',
  'Opportunities',
] as const

export function InstagramIntelligenceView({
  onAsk,
}: {
  onAsk: (prompt: string) => void
}) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Overview')
  const [error, setError] = useState('')
  const [reels, setReels] = useState<Record<string, unknown>[]>([])
  const [opps, setOpps] = useState<Record<string, unknown>[]>([])

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/instagram-intelligence')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load')
    setOverview(json.overview as Overview)
    setReels(json.reels || [])
    setOpps(json.opportunities || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>PHASE 8 · NICHE INTELLIGENCE</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>Instagram Intelligence</h2>
      <p style={{ margin: 0, color: colors.textSecondary, fontSize: 13, maxWidth: 720 }}>
        Own-account Graph + external WEB_RESEARCH (Brave). Third-party Instagram Graph is UNSUPPORTED.
        Metrics stay UNAVAILABLE when unknown — never fabricated zeros. No virality guarantees. No
        auto-publish.
      </p>
      {error ? <div style={{ color: colors.danger, marginTop: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec}
            type="button"
            style={section === sec ? s.solidBtn : s.ghostBtn}
            onClick={() => setSection(sec)}
          >
            {sec}
          </button>
        ))}
      </div>

      <div style={{ ...s.sectionLabel, marginTop: 18, marginLeft: 0 }}>Actions</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          style={s.primaryBtn}
          onClick={() =>
            onAsk(
              'Research fitness Reel trends in India for the last 7 days. Separate OBSERVED vs INFERENCE. No virality guarantees.'
            )
          }
        >
          Research Trends
        </button>
        <button
          type="button"
          style={s.primaryBtn}
          onClick={() =>
            onAsk(
              'Find viral fat-loss Reels from Indian fitness creators this week via WEB_RESEARCH. Mark unavailable metrics honestly.'
            )
          }
        >
          Find Viral Reels
        </button>
        <button
          type="button"
          style={s.primaryBtn}
          onClick={() => onAsk('Analyze fitness creator @example using public web research only.')}
        >
          Analyze Creator
        </button>
        <button
          type="button"
          style={s.primaryBtn}
          onClick={() =>
            onAsk(
              'Compare 3–5 Indian fitness creators for content patterns only — not a ranking.'
            )
          }
        >
          Compare Creators
        </button>
        <button
          type="button"
          style={s.primaryBtn}
          onClick={() =>
            onAsk(
              'Find content gaps: topics competitors cover that we have not posted recently.'
            )
          }
        >
          Find Content Gaps
        </button>
        <button
          type="button"
          style={s.solidBtn}
          onClick={() =>
            onAsk(
              'Generate original LURVOX content opportunities from current fitness trends, my taste, own Instagram evidence, and available footage. Do not publish.'
            )
          }
        >
          Generate Opportunities
        </button>
        <button
          type="button"
          style={s.ghostBtn}
          onClick={() => onAsk('Refresh niche intelligence within budget. Do not publish.')}
        >
          Refresh Research
        </button>
      </div>

      {section === 'Overview' && overview ? (
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700 }}>Overview</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, display: 'grid', gap: 4 }}>
            <div>Last research: {overview.last_research_run || '—'}</div>
            <div>Window: {overview.freshness || '—'}</div>
            <div>Scope: {overview.scope || '—'}</div>
            <div>Geography: {overview.geography || '—'}</div>
            <div>Sample size: {overview.sample_size}</div>
            <div>Watchlists: {overview.watchlists}</div>
            <div>Opportunities: {overview.opportunities}</div>
            <div>
              Discovery: {overview.discovery_method} · External Graph:{' '}
              {overview.external_graph}
            </div>
            <div>Limitations: {(overview.limitations || []).slice(0, 4).join(' · ')}</div>
          </div>
        </div>
      ) : null}

      {section === 'Viral Reels' ? (
        <div style={{ marginTop: 16 }}>
          {reels.length ? (
            reels.slice(0, 12).map((r, i) => (
              <div key={i} style={{ ...s.card, marginTop: 8 }}>
                <div style={{ fontWeight: 650 }}>{String(r.title || r.source_url)}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
                  {String(r.creator_handle || '—')} · views {String(r.observed_views)} ·{' '}
                  {String(r.geography)} · {String(r.discovery_method)}
                </div>
              </div>
            ))
          ) : (
            <div style={{ ...s.muted, marginTop: 8 }}>No stored viral references yet.</div>
          )}
        </div>
      ) : null}

      {section === 'Opportunities' ? (
        <div style={{ marginTop: 16 }}>
          {opps.length ? (
            opps.slice(0, 12).map((o, i) => (
              <div key={i} style={{ ...s.card, marginTop: 8 }}>
                <div style={{ fontWeight: 650 }}>{String(o.title)}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
                  {String(o.fit_level)} · {String(o.niche)} · {String(o.status)}
                </div>
              </div>
            ))
          ) : (
            <div style={{ ...s.muted, marginTop: 8 }}>No opportunities yet.</div>
          )}
        </div>
      ) : null}

      {section === 'Trends' ||
      section === 'Creators' ||
      section === 'Content Gaps' ||
      section === 'Research' ? (
        <div style={{ ...s.muted, marginTop: 16 }}>
          Use the actions above to run {section.toLowerCase()} via Jarvis chat tools. Results persist
          to the niche intelligence tables when research succeeds.
        </div>
      ) : null}
    </div>
  )
}
