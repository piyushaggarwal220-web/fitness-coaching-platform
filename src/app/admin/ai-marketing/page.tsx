'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { colors } from '@/lib/design-tokens'

type Section =
  | 'overview'
  | 'funnels'
  | 'meta'
  | 'campaigns'
  | 'creatives'
  | 'generator'
  | 'ugc'
  | 'video'
  | 'instagram'
  | 'funnel'
  | 'experiments'
  | 'decisions'
  | 'automation'
  | 'settings'
  | 'audit'
  | 'report'
  | 'create-test'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'funnels', label: 'Funnels' },
  { id: 'meta', label: 'Meta Ads' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'creatives', label: 'Creatives' },
  { id: 'generator', label: 'Creative Generator' },
  { id: 'create-test', label: 'CREATE TEST' },
  { id: 'ugc', label: 'UGC' },
  { id: 'video', label: 'Video Editor' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'funnel', label: 'Site Funnel' },
  { id: 'report', label: 'Daily Report' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'decisions', label: 'AI Decisions' },
  { id: 'automation', label: 'Automation' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit Log' },
]

function money(n: number | null | undefined, currency = 'INR') {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function num(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export default function AiMarketingDashboardPage() {
  const [section, setSection] = useState<Section>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
  const [creatives, setCreatives] = useState<Record<string, unknown>[]>([])
  const [campaigns, setCampaigns] = useState<Record<string, unknown>[]>([])
  const [adsets, setAdsets] = useState<Record<string, unknown>[]>([])
  const [ads, setAds] = useState<Record<string, unknown>[]>([])
  const [actions, setActions] = useState<Record<string, unknown>[]>([])
  const [decisions, setDecisions] = useState<Record<string, unknown>[]>([])
  const [content, setContent] = useState<Record<string, unknown>[]>([])
  const [experiments, setExperiments] = useState<Record<string, unknown>[]>([])
  const [videoJobs, setVideoJobs] = useState<Record<string, unknown>[]>([])
  const [audit, setAudit] = useState<Record<string, unknown>[]>([])
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [funnels, setFunnels] = useState<Record<string, unknown>[]>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState('')
  const [dailyReport, setDailyReport] = useState<Record<string, unknown> | null>(null)
  const [editCreative, setEditCreative] = useState<Record<string, unknown> | null>(null)
  const [videoSource, setVideoSource] = useState('')
  const [experimentForm, setExperimentForm] = useState({
    name: '',
    hypothesis: '',
    variable: '',
  })
  const [confirmHighAutonomy, setConfirmHighAutonomy] = useState(false)
  const [autonomyDraft, setAutonomyDraft] = useState(2)
  const [guardrailDraft, setGuardrailDraft] = useState<Record<string, number>>({})
  const [budgetRecs, setBudgetRecs] = useState<Record<string, unknown>[]>([])
  const [testForm, setTestForm] = useState({
    name: '',
    objective: 'OUTCOME_SALES',
    dailyBudgetInr: 500,
    testDays: 3,
  })
  const [testPreview, setTestPreview] = useState<Record<string, unknown> | null>(null)
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<string[]>([])

  const meta = (overview?.meta as Record<string, unknown> | undefined) ?? null
  const totals = (overview?.totals as Record<string, number> | undefined) ?? null

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/admin/ai-marketing/overview')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load overview')
    setOverview(json.overview)
  }, [])

  const loadSectionData = useCallback(async (sec: Section) => {
    if (sec === 'overview' || sec === 'meta' || sec === 'automation' || sec === 'funnels') {
      await loadOverview()
      const fres = await fetch('/api/admin/ai-marketing/funnels')
      const fjson = await fres.json()
      if (fjson.success) {
        setFunnels(fjson.funnels ?? [])
        if (!selectedFunnelId && fjson.funnels?.[0]?.id) {
          setSelectedFunnelId(String(fjson.funnels[0].id))
        }
      }
      if (sec === 'overview' || sec === 'funnels') {
        const bres = await fetch('/api/admin/ai-marketing/budget-recommendations')
        const bjson = await bres.json()
        if (bjson.success) setBudgetRecs(bjson.recommendations ?? [])
      }
    }
    if (sec === 'generator' || sec === 'creatives' || sec === 'create-test') {
      const fres = await fetch('/api/admin/ai-marketing/funnels')
      const fjson = await fres.json()
      if (fjson.success) {
        setFunnels(fjson.funnels ?? [])
        if (!selectedFunnelId && fjson.funnels?.[0]?.id) {
          setSelectedFunnelId(String(fjson.funnels[0].id))
        }
      }
    }
    if (sec === 'report') {
      const res = await fetch('/api/admin/ai-marketing/report')
      const json = await res.json()
      if (json.success) setDailyReport(json.report)
    }
    if (sec === 'creatives' || sec === 'generator' || sec === 'create-test') {
      const res = await fetch('/api/admin/ai-marketing/creatives?limit=50')
      const json = await res.json()
      if (json.success) setCreatives(json.creatives ?? [])
    }
    if (sec === 'campaigns') {
      const [cres, fres] = await Promise.all([
        fetch('/api/admin/ai-marketing/campaigns'),
        fetch('/api/admin/ai-marketing/funnels'),
      ])
      const json = await cres.json()
      const fjson = await fres.json()
      if (json.success) {
        setCampaigns(json.campaigns ?? [])
        setAdsets(json.adsets ?? [])
        setAds(json.ads ?? [])
      }
      if (fjson.success) setFunnels(fjson.funnels ?? [])
    }
    if (sec === 'decisions') {
      const res = await fetch('/api/admin/ai-marketing/actions?status=pending')
      const json = await res.json()
      if (json.success) {
        setActions(json.actions ?? [])
        setDecisions(json.decisions ?? [])
      }
    }
    if (sec === 'instagram') {
      const res = await fetch('/api/admin/ai-marketing/content')
      const json = await res.json()
      if (json.success) setContent(json.content ?? [])
    }
    if (sec === 'ugc') {
      const res = await fetch('/api/admin/ai-marketing/creatives?type=ugc')
      const json = await res.json()
      if (json.success) setCreatives(json.creatives ?? [])
    }
    if (sec === 'experiments') {
      const res = await fetch('/api/admin/ai-marketing/experiments')
      const json = await res.json()
      if (json.success) setExperiments(json.experiments ?? [])
    }
    if (sec === 'video') {
      const res = await fetch('/api/admin/ai-marketing/video-jobs')
      const json = await res.json()
      if (json.success) setVideoJobs(json.jobs ?? [])
    }
    if (sec === 'audit') {
      const res = await fetch('/api/admin/ai-marketing/audit')
      const json = await res.json()
      if (json.success) setAudit(json.events ?? [])
    }
    if (sec === 'settings') {
      const res = await fetch('/api/admin/ai-marketing/settings')
      const json = await res.json()
      if (json.success) {
        setSettings(json.settings)
        setAutonomyDraft(Number(json.settings.autonomyLevel ?? 2))
        setGuardrailDraft(json.settings.guardrails ?? {})
      }
    }
    if (sec === 'funnel') {
      await loadOverview()
    }
  }, [loadOverview])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError('')
      try {
        await loadSectionData(section)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [section, loadSectionData])

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError('')
    setMessage('')
    try {
      await fn()
      setMessage(`${label} complete`)
      await loadSectionData(section)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy('')
    }
  }

  const currency = useMemo(() => {
    const g = (overview?.accountGuardrails ?? overview?.guardrails) as { currency?: string } | undefined
    return g?.currency ?? 'INR'
  }, [overview])

  return (
    <div style={s.page}>
      <AdminNavbar />
      <div style={s.containerWide}>
        <Link href="/admin/dashboard" style={s.backLink}>
          ← Admin
        </Link>
        <h1 style={s.title}>{brandTitle('AI Marketing OS')}</h1>
        <p style={s.subtitle}>
          Safe approval mode by default. AI analyzes and generates; Meta spend/actions require
          human approval until autonomy is explicitly raised.
        </p>

        <div style={navRow}>
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              style={{
                ...chip,
                backgroundColor: section === item.id ? colors.accent : colors.bgElevated,
                color: section === item.id ? colors.textInverse : colors.textPrimary,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div style={s.error}>{error}</div> : null}
        {message ? (
          <div style={{ ...s.card, borderColor: colors.success, color: colors.success }}>
            {message}
          </div>
        ) : null}
        {busy ? <div style={s.loading}>Working: {busy}…</div> : null}
        {loading ? <div style={s.loading}>Loading…</div> : null}

        {!loading && section === 'overview' && overview ? (
          <>
            <IntegrationBanner meta={meta} isMock={Boolean(overview.isMockData)} />
            <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Metrics are per-funnel. Do not compare raw CPA between ₹99 and ₹1,699 without offer
              value. Initial ROAS ≠ blended customer value. Account CPA/ROAS targets are removed —
              each funnel has its own economics.
            </p>
            {((overview.byFunnel as Record<string, unknown>[]) ?? []).map((f) => (
              <div key={String(f.funnel_id)} style={s.card}>
                <h2 style={s.cardTitle}>{String(f.funnel_name)}</h2>
                <div style={s.statGrid}>
                  <Stat label="Spend" value={money(Number(f.spend), currency)} />
                  <Stat label="Revenue" value={money(Number(f.revenue), currency)} />
                  <Stat label="Purchases" value={String(f.purchases ?? 0)} />
                  <Stat label="CPA" value={money(Number(f.cpa), currency)} />
                  <Stat label="Initial ROAS" value={num(Number(f.initial_roas))} />
                  <Stat label="Target CPA" value={money(Number(f.target_cpa), currency)} />
                  <Stat label="Target ROAS" value={num(Number(f.target_roas))} />
                  <Stat label="Offer price" value={money(Number(f.price_inr), currency)} />
                </div>
              </div>
            ))}
            {overview.unclassified && Number((overview.unclassified as Record<string, unknown>).spend) > 0 ? (
              <div style={{ ...s.card, borderColor: colors.warning }}>
                <h2 style={s.cardTitle}>UNCLASSIFIED</h2>
                <p style={{ fontSize: 14 }}>
                  Spend {money(Number((overview.unclassified as Record<string, unknown>).spend), currency)} —
                  assign campaigns to a funnel before optimizing.
                </p>
              </div>
            ) : null}
            <div style={s.card}>
              <h2 style={s.cardTitle}>Business total (blended)</h2>
              <div style={s.statGrid}>
                <Stat label="Total spend" value={money(totals?.spend, currency)} />
                <Stat label="Total revenue" value={money(totals?.revenue, currency)} />
                <Stat label="Total purchases" value={String(totals?.purchases ?? 0)} />
                <Stat label="Blended CPA" value={money(totals?.cpa, currency)} />
                <Stat label="Blended ROAS" value={num(totals?.initial_roas ?? totals?.roas)} />
              </div>
            </div>
            <div style={s.statGrid}>
              <Stat label="Pending approvals" value={String(overview.pendingApprovals ?? 0)} />
              <Stat label="Unclassified campaigns" value={String(overview.unclassifiedCampaignCount ?? 0)} />
              <Stat label="Autonomy level" value={String(overview.autonomyLevel ?? 2)} />
            </div>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Budget recommendations (approval required)</h2>
              <button
                type="button"
                style={s.secondaryBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  void runAction('Refresh budget recommendations', async () => {
                    const res = await fetch('/api/admin/ai-marketing/budget-recommendations', {
                      method: 'POST',
                    })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Failed')
                    setBudgetRecs(json.recommendations ?? [])
                  })
                }
              >
                Refresh recommendations
              </button>
              {budgetRecs.map((r) => (
                <div key={String(r.funnel_id)} style={{ marginTop: 12, fontSize: 14 }}>
                  <strong>{String(r.funnel_name)}</strong>
                  <div>
                    Recommended budget: {money(Number(r.current_daily_budget), currency)} →{' '}
                    {money(Number(r.recommended_daily_budget), currency)}
                  </div>
                  <div>Action: {String(r.action)}</div>
                  <div style={{ color: colors.textSecondary }}>{String(r.reason)}</div>
                </div>
              ))}
              {!budgetRecs.length ? (
                <p style={{ fontSize: 13, color: colors.textMuted }}>No recommendations yet.</p>
              ) : null}
            </div>
            <div style={s.card}>
              <h2 style={s.cardTitle}>AI recommendations needing approval</h2>
              <DecisionList
                items={(overview.recentDecisions as Record<string, unknown>[]) ?? []}
              />
            </div>
          </>
        ) : null}

        {!loading && section === 'funnels' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Marketing funnels (independent economics)</h2>
            <p style={{ fontSize: 14, color: colors.textSecondary }}>
              Each funnel has its own price, target CPA, max CPA, target ROAS, budgets, and
              audiences. Add more funnels (₹3,499, etc.) without code changes via API or future UI.
            </p>
            {(funnels.length ? funnels : ((overview?.funnels as Record<string, unknown>[]) ?? [])).map(
              (f) => (
                <div key={String(f.id)} style={{ ...s.card, marginTop: 12 }}>
                  <div style={{ fontWeight: 700 }}>{String(f.name)}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted }}>
                    slug {String(f.slug)} · price ₹{String(f.price_inr)} · status {String(f.status)}
                  </div>
                  <div style={s.statGrid}>
                    <Stat label="Target CPA" value={money(Number(f.target_cpa), currency)} />
                    <Stat label="Max CPA" value={money(Number(f.max_acceptable_cpa), currency)} />
                    <Stat label="Target ROAS" value={num(Number(f.target_roas))} />
                    <Stat label="Min ROAS" value={num(Number(f.min_roas))} />
                    <Stat label="Daily budget" value={money(Number(f.daily_budget_inr), currency)} />
                    <Stat label="Test budget" value={money(Number(f.test_budget_inr), currency)} />
                    <Stat label="Margin" value={money(Number(f.contribution_margin_inr), currency)} />
                    <Stat label="Fulfillment cost" value={money(Number(f.estimated_fulfillment_cost_inr), currency)} />
                  </div>
                  <p style={{ fontSize: 13 }}>{String(f.notes ?? '')}</p>
                </div>
              )
            )}
          </div>
        ) : null}

        {!loading && section === 'meta' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Meta integration</h2>
            <IntegrationBanner meta={meta} isMock={Boolean(overview?.isMockData)} />
            <div style={s.toolbar}>
              <button
                type="button"
                style={s.primaryBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  void runAction('Sync Meta', async () => {
                    const res = await fetch('/api/admin/ai-marketing/sync-meta', { method: 'POST' })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.result?.error || json.error || 'Sync failed')
                  })
                }
              >
                Sync Meta Data
              </button>
              <button
                type="button"
                style={s.secondaryBtn}
                disabled={Boolean(busy)}
                onClick={() =>
                  void runAction('Analyze performance', async () => {
                    const res = await fetch('/api/admin/ai-marketing/analyze', { method: 'POST' })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Analyze failed')
                  })
                }
              >
                Run AI Analysis
              </button>
            </div>
            <p style={{ color: colors.textSecondary, fontSize: 14 }}>
              Sync requires: <code>META_ADS_ACCESS_TOKEN</code>, <code>META_ADS_AD_ACCOUNT_ID</code>.
              Creative/test writes also need <code>META_ADS_PAGE_ID</code>. ACTIVE publishing requires{' '}
              <code>LIVE_META_EXECUTION_ENABLED=true</code> (kept false). Autonomy stays at 2.
            </p>
            {meta?.writeMissing ? (
              <p style={{ fontSize: 13, color: colors.textMuted }}>
                Write extras: {(meta.writeMissing as string[]).join(', ') || 'none'}
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && section === 'campaigns' ? (
          <>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Assign campaigns to funnels</h2>
              <p style={{ fontSize: 14, color: colors.textSecondary }}>
                If the system cannot determine the funnel, leave UNCLASSIFIED. Do not guess.
              </p>
              {(campaigns as Record<string, unknown>[]).map((c) => (
                <div key={String(c.id)} style={{ ...s.toolbar, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>
                    {String(c.name)}{' '}
                    <span style={{ color: colors.textMuted }}>
                      ({c.funnel_id
                        ? String((c.marketing_funnels as { name?: string } | null)?.name ?? c.funnel_id)
                        : 'UNCLASSIFIED'}
                      )
                    </span>
                  </span>
                  <select
                    style={s.select}
                    defaultValue={c.funnel_id ? String(c.funnel_id) : ''}
                    onChange={(e) => {
                      const value = e.target.value
                      void runAction('Assign campaign', async () => {
                        const res = await fetch('/api/admin/ai-marketing/funnels', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'assign_campaign',
                            campaignId: c.id,
                            funnelId: value || null,
                            unclassified: !value,
                            cascade: true,
                          }),
                        })
                        const json = await res.json()
                        if (!json.success) throw new Error(json.error || 'Assign failed')
                      })
                    }}
                  >
                    <option value="">UNCLASSIFIED</option>
                    {funnels.map((f) => (
                      <option key={String(f.id)} value={String(f.id)}>
                        {String(f.name)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <EntityTable title="Campaigns" rows={campaigns} cols={['name', 'status', 'objective', 'funnel_id', 'meta_campaign_id']} />
            <EntityTable title="Ad sets" rows={adsets} cols={['name', 'status', 'daily_budget_cents', 'funnel_id', 'meta_adset_id']} />
            <EntityTable title="Ads" rows={ads} cols={['name', 'status', 'funnel_id', 'meta_ad_id']} />
          </>
        ) : null}

        {!loading && (section === 'creatives' || section === 'ugc') ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>{section === 'ugc' ? 'UGC creatives' : 'Creative library'}</h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {creatives.map((c) => (
                <div key={String(c.id)} style={creativeCard}>
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(c.image_url)} alt="" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={imagePlaceholder}>No image</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{String(c.name)}</div>
                    <div style={{ fontSize: 13, color: colors.textMuted }}>
                      {String(c.angle)} · {String(c.status)} · {String(c.type)}
                      {c.performance_status ? ` · perf: ${String(c.performance_status)}` : ''}
                      {c.meta_creative_id ? ` · Meta: ${String(c.meta_creative_id)}` : ''}
                    </div>
                    <p style={{ margin: '8px 0', fontSize: 14 }}><strong>Hook:</strong> {String(c.hook ?? '')}</p>
                    <p style={{ margin: '8px 0', fontSize: 14 }}><strong>Headline:</strong> {String(c.headline ?? '')}</p>
                    <p style={{ margin: '8px 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{String(c.primary_text ?? '')}</p>
                    <div style={s.toolbar}>
                      <button type="button" style={s.secondaryBtn} onClick={() => setEditCreative(c)}>Edit copy</button>
                      <button
                        type="button"
                        style={s.primaryBtn}
                        onClick={() =>
                          void runAction('Approve creative', async () => {
                            await patchCreative(String(c.id), { status: 'approved' })
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        style={s.secondaryBtn}
                        onClick={() =>
                          void runAction('Reject creative', async () => {
                            await patchCreative(String(c.id), { status: 'rejected' })
                          })
                        }
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        style={s.secondaryBtn}
                        onClick={() =>
                          void runAction('Regenerate image', async () => {
                            const res = await fetch('/api/admin/ai-marketing/regenerate-image', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ creativeId: c.id }),
                            })
                            const json = await res.json()
                            if (!json.success) throw new Error(json.error || 'Regenerate failed')
                          })
                        }
                      >
                        Regenerate
                      </button>
                      <button
                        type="button"
                        style={s.secondaryBtn}
                        onClick={() =>
                          void runAction('Mark ready for Meta', async () => {
                            await patchCreative(String(c.id), { status: 'ready_for_meta' })
                          })
                        }
                      >
                        Ready for Meta
                      </button>
                      <button
                        type="button"
                        style={s.primaryBtn}
                        disabled={!['approved', 'ready_for_meta'].includes(String(c.status))}
                        onClick={() =>
                          void runAction('Push creative to Meta', async () => {
                            const res = await fetch('/api/admin/ai-marketing/push-creative', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ creativeId: c.id }),
                            })
                            const json = await res.json()
                            if (!json.success) throw new Error(json.error || 'Meta push failed')
                            setMessage(
                              json.meta_creative_id
                                ? `Meta creative: ${json.meta_creative_id}`
                                : 'Push recorded'
                            )
                          })
                        }
                      >
                        Push to Meta
                      </button>
                      {c.image_url ? (
                        <a href={String(c.image_url)} download style={s.secondaryBtn as CSSProperties}>
                          Download
                        </a>
                      ) : null}
                      <button
                        type="button"
                        style={s.secondaryBtn}
                        onClick={() =>
                          void runAction('Regenerate variations', async () => {
                            const funnelId = String(c.funnel_id || selectedFunnelId)
                            if (!funnelId) throw new Error('Assign creative to a funnel first')
                            const res = await fetch('/api/admin/ai-marketing/generate-creatives', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                count: 5,
                                funnelId,
                                parentCreativeId: c.id,
                                variationMode: true,
                              }),
                            })
                            const json = await res.json()
                            if (!json.success) throw new Error(json.error || 'Failed')
                          })
                        }
                      >
                        5 variations
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!creatives.length ? <div style={s.empty}>No creatives yet.</div> : null}
            </div>
          </div>
        ) : null}

        {!loading && section === 'generator' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Static ad factory (per funnel)</h2>
            <p style={{ fontSize: 14, color: colors.textSecondary }}>
              Flow: GENERATE → PREVIEW (Creatives) → REGENERATE → APPROVE → READY FOR META → Push to Meta
            </p>
            <label style={labelStyle}>
              Funnel
              <select
                style={s.select}
                value={selectedFunnelId}
                onChange={(e) => setSelectedFunnelId(e.target.value)}
              >
                {funnels.map((f) => (
                  <option key={String(f.id)} value={String(f.id)}>
                    {String(f.name)} (₹{String(f.price_inr)})
                  </option>
                ))}
              </select>
            </label>
            <div style={s.toolbar}>
              {[5, 10, 20, 50].map((count) => (
                <button
                  key={count}
                  type="button"
                  style={s.primaryBtn}
                  disabled={Boolean(busy) || !selectedFunnelId}
                  onClick={() =>
                    void runAction(`Generate ${count}`, async () => {
                      const res = await fetch('/api/admin/ai-marketing/generate-creatives', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          count,
                          funnelId: selectedFunnelId,
                          generateImages: true,
                        }),
                      })
                      const json = await res.json()
                      if (!json.success) throw new Error(json.error || 'Generation failed')
                      setSection('creatives')
                    })
                  }
                >
                  Generate {count}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && section === 'create-test' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>CREATE TEST (PAUSED Meta objects)</h2>
            <p style={{ fontSize: 14, color: colors.textSecondary }}>
              Preview guardrails first. At autonomy 2, confirming creates PAUSED campaign/ad set/ads only.
              ACTIVE publishing stays blocked until LIVE_META_EXECUTION_ENABLED.
            </p>
            <label style={labelStyle}>
              Funnel
              <select
                style={s.select}
                value={selectedFunnelId}
                onChange={(e) => setSelectedFunnelId(e.target.value)}
              >
                {funnels.map((f) => (
                  <option key={String(f.id)} value={String(f.id)}>
                    {String(f.name)} — target CPA ₹{String(f.target_cpa)} / max ₹
                    {String(f.max_acceptable_cpa)} / ROAS {String(f.target_roas)}
                  </option>
                ))}
              </select>
            </label>
            <input
              style={s.input}
              placeholder="Campaign name"
              value={testForm.name}
              onChange={(e) => setTestForm((f) => ({ ...f, name: e.target.value }))}
            />
            <label style={labelStyle}>
              Objective
              <select
                style={s.select}
                value={testForm.objective}
                onChange={(e) => setTestForm((f) => ({ ...f, objective: e.target.value }))}
              >
                <option value="OUTCOME_SALES">OUTCOME_SALES</option>
                <option value="OUTCOME_TRAFFIC">OUTCOME_TRAFFIC</option>
                <option value="OUTCOME_ENGAGEMENT">OUTCOME_ENGAGEMENT</option>
              </select>
            </label>
            <div style={s.toolbar}>
              <label style={labelStyle}>
                Daily budget (INR)
                <input
                  style={s.input}
                  type="number"
                  value={testForm.dailyBudgetInr}
                  onChange={(e) =>
                    setTestForm((f) => ({ ...f, dailyBudgetInr: Number(e.target.value) }))
                  }
                />
              </label>
              <label style={labelStyle}>
                Test days
                <input
                  style={s.input}
                  type="number"
                  value={testForm.testDays}
                  onChange={(e) =>
                    setTestForm((f) => ({ ...f, testDays: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
            <p style={{ fontSize: 13 }}>Select approved / ready creatives for this funnel:</p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {creatives
                .filter(
                  (c) =>
                    String(c.funnel_id) === selectedFunnelId &&
                    ['approved', 'ready_for_meta'].includes(String(c.status))
                )
                .map((c) => {
                  const id = String(c.id)
                  const checked = selectedCreativeIds.includes(id)
                  return (
                    <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedCreativeIds((prev) =>
                            e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                          )
                        }}
                      />
                      {String(c.name)} {c.meta_creative_id ? `(Meta ${String(c.meta_creative_id)})` : ''}
                    </label>
                  )
                })}
            </div>
            <div style={s.toolbar}>
              <button
                type="button"
                style={s.secondaryBtn}
                disabled={Boolean(busy) || !selectedFunnelId || !testForm.name || !selectedCreativeIds.length}
                onClick={() =>
                  void runAction('Preview test', async () => {
                    const res = await fetch('/api/admin/ai-marketing/create-test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        funnelId: selectedFunnelId,
                        name: testForm.name,
                        objective: testForm.objective,
                        dailyBudgetInr: testForm.dailyBudgetInr,
                        testDays: testForm.testDays,
                        creativeIds: selectedCreativeIds,
                        execute: false,
                      }),
                    })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Preview failed')
                    setTestPreview(json.preview)
                  })
                }
              >
                Preview
              </button>
              <button
                type="button"
                style={s.primaryBtn}
                disabled={Boolean(busy) || !testPreview}
                onClick={() =>
                  void runAction('Create PAUSED Meta test', async () => {
                    const res = await fetch('/api/admin/ai-marketing/create-test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        funnelId: selectedFunnelId,
                        name: testForm.name,
                        objective: testForm.objective,
                        dailyBudgetInr: testForm.dailyBudgetInr,
                        testDays: testForm.testDays,
                        creativeIds: selectedCreativeIds,
                        execute: true,
                      }),
                    })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Create failed')
                    setMessage(
                      json.meta?.meta_campaign_id
                        ? `Created PAUSED campaign ${json.meta.meta_campaign_id}`
                        : 'Test launch recorded'
                    )
                    setTestPreview(json.preview)
                  })
                }
              >
                Approve & create PAUSED
              </button>
            </div>
            {testPreview ? (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 16 }}>
                {JSON.stringify(testPreview, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}

        {!loading && section === 'ugc' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>UGC factory</h2>
            <div style={s.toolbar}>
              {[5, 10].map((count) => (
                <button
                  key={count}
                  type="button"
                  style={s.primaryBtn}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void runAction(`UGC ${count}`, async () => {
                      const res = await fetch('/api/admin/ai-marketing/generate-ugc', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ count }),
                      })
                      const json = await res.json()
                      if (!json.success) throw new Error(json.error || 'Failed')
                    })
                  }
                >
                  Generate {count} UGC
                </button>
              ))}
            </div>
            <p style={{ color: colors.textSecondary, fontSize: 14 }}>
              Scripts are labeled AI-generated / scripted ads. No fabricated testimonials. Video
              provider is stubbed until <code>UGC_VIDEO_PROVIDER</code> is connected.
            </p>
          </div>
        ) : null}

        {!loading && section === 'video' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Gym video edit jobs</h2>
            <div style={s.toolbar}>
              <input
                style={s.input}
                placeholder="Source video URL or storage path"
                value={videoSource}
                onChange={(e) => setVideoSource(e.target.value)}
              />
              <button
                type="button"
                style={s.primaryBtn}
                disabled={Boolean(busy) || !videoSource.trim()}
                onClick={() =>
                  void runAction('Create video job', async () => {
                    const res = await fetch('/api/admin/ai-marketing/video-jobs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sourceVideo: videoSource.trim() }),
                    })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Failed')
                    setVideoSource('')
                  })
                }
              >
                Queue job
              </button>
            </div>
            <EntityTable
              title="Jobs"
              rows={videoJobs}
              cols={['id', 'status', 'provider', 'source_video', 'error']}
            />
          </div>
        ) : null}

        {!loading && section === 'instagram' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Instagram content engine</h2>
            <div style={s.toolbar}>
              {[5, 10, 20].map((count) => (
                <button
                  key={count}
                  type="button"
                  style={s.primaryBtn}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void runAction(`Instagram ${count}`, async () => {
                      const res = await fetch('/api/admin/ai-marketing/generate-instagram', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ count }),
                      })
                      const json = await res.json()
                      if (!json.success) throw new Error(json.error || 'Failed')
                    })
                  }
                >
                  {count} ideas
                </button>
              ))}
            </div>
            <EntityTable
              title="Content calendar / ideas"
              rows={content}
              cols={['topic', 'hook', 'content_category', 'status', 'scheduled_for']}
            />
          </div>
        ) : null}

        {!loading && section === 'report' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Daily multi-funnel report</h2>
            <button
              type="button"
              style={s.primaryBtn}
              disabled={Boolean(busy)}
              onClick={() =>
                void runAction('Build report', async () => {
                  const res = await fetch('/api/admin/ai-marketing/report', { method: 'POST' })
                  const json = await res.json()
                  if (!json.success) throw new Error(json.error || 'Failed')
                  setDailyReport(json.report)
                })
              }
            >
              Generate / refresh report
            </button>
            {dailyReport ? (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 16 }}>
                {String(dailyReport.text ?? '')}
              </pre>
            ) : (
              <div style={s.empty}>No report yet.</div>
            )}
          </div>
        ) : null}

        {!loading && section === 'funnel' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Funnel intelligence</h2>
            <button
              type="button"
              style={s.primaryBtn}
              disabled={Boolean(busy)}
              onClick={() =>
                void runAction('Analyze funnel', async () => {
                  const res = await fetch('/api/admin/ai-marketing/funnel', { method: 'POST' })
                  const json = await res.json()
                  if (!json.success) throw new Error(json.error || 'Failed')
                  setMessage(
                    `Primary problem: ${json.diagnosis?.primary_problem} — ${json.diagnosis?.reason}`
                  )
                })
              }
            >
              Analyze funnel
            </button>
          </div>
        ) : null}

        {!loading && section === 'experiments' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Experiments</h2>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              <input
                style={s.input}
                placeholder="Experiment name"
                value={experimentForm.name}
                onChange={(e) => setExperimentForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                style={s.input}
                placeholder="Hypothesis"
                value={experimentForm.hypothesis}
                onChange={(e) => setExperimentForm((f) => ({ ...f, hypothesis: e.target.value }))}
              />
              <input
                style={s.input}
                placeholder="Variable (e.g. messaging angle)"
                value={experimentForm.variable}
                onChange={(e) => setExperimentForm((f) => ({ ...f, variable: e.target.value }))}
              />
              <button
                type="button"
                style={s.primaryBtn}
                onClick={() =>
                  void runAction('Create experiment', async () => {
                    const res = await fetch('/api/admin/ai-marketing/experiments', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(experimentForm),
                    })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Failed')
                    setExperimentForm({ name: '', hypothesis: '', variable: '' })
                  })
                }
              >
                Create experiment
              </button>
            </div>
            <EntityTable
              title="All experiments"
              rows={experiments}
              cols={['name', 'hypothesis', 'variable', 'status', 'success_metric']}
            />
          </div>
        ) : null}

        {!loading && section === 'decisions' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>AI recommendations</h2>
            <div style={s.toolbar}>
              <button
                type="button"
                style={s.secondaryBtn}
                onClick={() =>
                  void runAction('Run Marketing Brain', async () => {
                    const res = await fetch('/api/admin/ai-marketing/brain', { method: 'POST' })
                    const json = await res.json()
                    if (!json.success) throw new Error(json.error || 'Failed')
                  })
                }
              >
                Run Marketing Brain
              </button>
            </div>
            {actions.map((a) => {
              const decision = a.marketing_ai_decisions as Record<string, unknown> | null
              const params = (a.parameters as Record<string, unknown>) || {}
              return (
                <div key={String(a.id)} style={{ ...s.card, marginTop: 12 }}>
                  <div style={{ fontWeight: 700 }}>{String(a.action_type)}</div>
                  <p style={{ fontSize: 14 }}>
                    <strong>Reason:</strong> {String(decision?.reasoning ?? params.issue ?? '—')}
                  </p>
                  <p style={{ fontSize: 14 }}>
                    <strong>Evidence:</strong>{' '}
                    {Array.isArray(decision?.evidence)
                      ? (decision?.evidence as string[]).join(' · ')
                      : Array.isArray(params.evidence)
                        ? (params.evidence as string[]).join(' · ')
                        : '—'}
                  </p>
                  <p style={{ fontSize: 14 }}>
                    <strong>Confidence:</strong> {num(Number(decision?.confidence))} ·{' '}
                    <strong>Risk:</strong> {String(a.risk_level)}
                  </p>
                  {(a.action_type === 'INCREASE_BUDGET' || a.action_type === 'DECREASE_BUDGET') && (
                    <p style={{ fontSize: 14 }}>
                      Current budget: {String(params.current_budget ?? '—')} → Proposed:{' '}
                      {String(params.proposed_budget ?? '—')} (
                      {num(Number(params.percentage_change))}%)
                    </p>
                  )}
                  <div style={s.toolbar}>
                    <button
                      type="button"
                      style={s.primaryBtn}
                      onClick={() =>
                        void runAction('Approve action', async () => {
                          const res = await fetch('/api/admin/ai-marketing/actions/approve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ actionId: a.id, approve: true }),
                          })
                          const json = await res.json()
                          if (!json.success) throw new Error(json.error || 'Approve failed')
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      style={s.secondaryBtn}
                      onClick={() =>
                        void runAction('Reject action', async () => {
                          const res = await fetch('/api/admin/ai-marketing/actions/approve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ actionId: a.id, approve: false }),
                          })
                          const json = await res.json()
                          if (!json.success) throw new Error(json.error || 'Reject failed')
                        })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
            {!actions.length ? <div style={s.empty}>No pending actions.</div> : null}
            <h3 style={{ marginTop: 24 }}>Recent decisions</h3>
            <DecisionList items={decisions} />
          </div>
        ) : null}

        {!loading && section === 'automation' ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Automation</h2>
            <p style={{ fontSize: 14, color: colors.textSecondary }}>
              Cron routes (Bearer CRON_SECRET):
            </p>
            <ul style={{ color: colors.textPrimary }}>
              <li><code>/api/cron/ai-marketing-sync</code> — Meta data sync</li>
              <li><code>/api/cron/ai-marketing-analyze</code> — analysis + brain cycle</li>
            </ul>
            <p style={{ fontSize: 14 }}>
              Current autonomy: <strong>{String(overview?.autonomyLevel ?? '—')}</strong> (default 2 =
              approval required). Levels 3–4 require explicit confirmation in Settings.
            </p>
          </div>
        ) : null}

        {!loading && section === 'settings' && settings ? (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Settings & guardrails</h2>
            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 12 }}>
              Account guardrails are spend/change caps only. TARGET_CPA and TARGET_ROAS live on each
              funnel (Funnels tab) — never a single global ₹2,500 CPA.
            </p>
            <label style={labelStyle}>
              Autonomy level (0–4)
              <select
                style={s.select}
                value={autonomyDraft}
                onChange={(e) => setAutonomyDraft(Number(e.target.value))}
              >
                <option value={0}>0 — Disabled</option>
                <option value={1}>1 — Recommendations only</option>
                <option value={2}>2 — Approval required (default)</option>
                <option value={3}>3 — Guarded autonomy</option>
                <option value={4}>4 — Full autonomy</option>
              </select>
            </label>
            {(autonomyDraft === 3 || autonomyDraft === 4) && (
              <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={confirmHighAutonomy}
                  onChange={(e) => setConfirmHighAutonomy(e.target.checked)}
                />
                I understand levels 3/4 can enable more automated behavior (Meta writes still need
                LIVE_META_EXECUTION_ENABLED).
              </label>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
              {Object.entries(guardrailDraft).map(([key, value]) =>
                typeof value === 'number' ? (
                  <label key={key} style={labelStyle}>
                    {key}
                    <input
                      style={s.input}
                      type="number"
                      value={value}
                      onChange={(e) =>
                        setGuardrailDraft((g) => ({ ...g, [key]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ) : null
              )}
            </div>
            <button
              type="button"
              style={{ ...s.primaryBtn, marginTop: 16 }}
              onClick={() =>
                void runAction('Save settings', async () => {
                  const res = await fetch('/api/admin/ai-marketing/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      autonomyLevel: autonomyDraft,
                      confirmHighAutonomy,
                      guardrails: guardrailDraft,
                    }),
                  })
                  const json = await res.json()
                  if (!json.success) throw new Error(json.error || 'Save failed')
                  setSettings(json.settings)
                })
              }
            >
              Save settings
            </button>
            <pre style={{ marginTop: 16, fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(settings.meta, null, 2)}
            </pre>
          </div>
        ) : null}

        {!loading && section === 'audit' ? (
          <EntityTable
            title="Audit log"
            rows={audit}
            cols={['timestamp', 'agent', 'decision', 'action', 'approval', 'confidence', 'error']}
          />
        ) : null}

        {editCreative ? (
          <EditCreativeModal
            creative={editCreative}
            onClose={() => setEditCreative(null)}
            onSave={async (patch) => {
              await runAction('Save creative', async () => {
                await patchCreative(String(editCreative.id), patch)
                setEditCreative(null)
              })
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

async function patchCreative(id: string, patch: Record<string, unknown>) {
  const res = await fetch('/api/admin/ai-marketing/creatives', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Update failed')
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  )
}

function IntegrationBanner({
  meta,
  isMock,
}: {
  meta: Record<string, unknown> | null
  isMock: boolean
}) {
  if (!meta) return null
  const configured = Boolean(meta.configured)
  return (
    <div
      style={{
        ...s.card,
        borderColor: configured ? colors.success : colors.warning,
      }}
    >
      <strong>{configured ? 'Meta Ads: LIVE credentials configured' : 'Meta Ads: NOT connected'}</strong>
      <div style={{ fontSize: 14, marginTop: 6, color: colors.textSecondary }}>
        {configured
          ? `Account ${String(meta.adAccountId)} · API ${String(meta.apiVersion)} · Last sync ${String(meta.lastSyncAt ?? 'never')} · LIVE_META_EXECUTION=${String(meta.liveExecutionEnabled ?? false)} · PAGE_ID=${meta.pageIdConfigured ? 'set' : 'missing'}`
          : `Missing: ${Array.isArray(meta.missing) ? (meta.missing as string[]).join(', ') : 'credentials'}. Dashboard will not pretend to be connected.`}
      </div>
      {isMock ? (
        <div style={{ marginTop: 8, color: colors.warning, fontSize: 13 }}>
          Performance data includes MOCK/DEMO rows — labeled in DB as is_mock=true.
        </div>
      ) : null}
      {meta.lastSyncError ? (
        <div style={{ marginTop: 8, color: colors.danger, fontSize: 13 }}>
          Last sync error: {String(meta.lastSyncError)}
        </div>
      ) : null}
    </div>
  )
}

function DecisionList({ items }: { items: Record<string, unknown>[] }) {
  if (!items.length) return <div style={s.empty}>No decisions yet.</div>
  return (
    <div>
      {items.map((d) => (
        <div key={String(d.id)} style={s.activityItem}>
          <div>
            <strong>{String(d.decision)}</strong> → {String(d.recommended_action)} ({String(d.status)})
          </div>
          <div style={s.activityTime}>
            confidence {num(Number(d.confidence))} · risk {String(d.risk_level)} ·{' '}
            {String(d.created_at ?? '')}
          </div>
        </div>
      ))}
    </div>
  )
}

function EntityTable({
  title,
  rows,
  cols,
}: {
  title: string
  rows: Record<string, unknown>[]
  cols: string[]
}) {
  return (
    <div style={s.card}>
      <h2 style={s.cardTitle}>{title}</h2>
      {!rows.length ? (
        <div style={s.empty}>No rows.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} style={s.th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={String(row.id ?? idx)}>
                  {cols.map((c) => (
                    <td key={c} style={s.td}>
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatCell(value: unknown) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function EditCreativeModal({
  creative,
  onClose,
  onSave,
}: {
  creative: Record<string, unknown>
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [headline, setHeadline] = useState(String(creative.headline ?? ''))
  const [hook, setHook] = useState(String(creative.hook ?? ''))
  const [primaryText, setPrimaryText] = useState(String(creative.primary_text ?? ''))
  const [description, setDescription] = useState(String(creative.description ?? ''))
  const [cta, setCta] = useState(String(creative.cta ?? ''))

  return (
    <div style={modalOverlay}>
      <div style={{ ...s.card, maxWidth: 640, width: '100%' }}>
        <h2 style={s.cardTitle}>Edit creative copy</h2>
        <label style={labelStyle}>Hook<input style={s.input} value={hook} onChange={(e) => setHook(e.target.value)} /></label>
        <label style={labelStyle}>Headline<input style={s.input} value={headline} onChange={(e) => setHeadline(e.target.value)} /></label>
        <label style={labelStyle}>Primary text<textarea style={{ ...s.input, minHeight: 120 }} value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} /></label>
        <label style={labelStyle}>Description<input style={s.input} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label style={labelStyle}>CTA<input style={s.input} value={cta} onChange={(e) => setCta(e.target.value)} /></label>
        <div style={s.toolbar}>
          <button type="button" style={s.primaryBtn} onClick={() => void onSave({ hook, headline, primary_text: primaryText, description, cta })}>
            Save
          </button>
          <button type="button" style={s.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const navRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 20,
}

const chip: CSSProperties = {
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 999,
  padding: '8px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
}

const creativeCard: CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: 16,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 12,
  background: colors.bgElevated,
}

const imagePlaceholder: CSSProperties = {
  width: 160,
  height: 160,
  borderRadius: 8,
  background: colors.bgCard,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: colors.textMuted,
  fontSize: 13,
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: colors.textSecondary,
  marginBottom: 10,
}

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
}
