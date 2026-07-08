'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FounderAnalyticsPanel } from '@/components/admin/analytics/FounderAnalyticsPanel'
import { ComplexityAnalyticsPanel } from '@/components/admin/analytics/ComplexityAnalyticsPanel'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { adminStyles as s } from '@/lib/admin/styles'
import type { PlatformHealth } from '@/lib/admin/platform-health'
import type { PromptLibraryStats } from '@/types/database'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type ActivityItem = {
  id: string
  type: string
  label: string
  at: string
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adminLabel, setAdminLabel] = useState('Admin')
  const [stats, setStats] = useState({ clients: 0, coaches: 0, activePlans: 0, pendingOnboarding: 0 })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [health, setHealth] = useState<PlatformHealth | null>(null)
  const [promptStats, setPromptStats] = useState<PromptLibraryStats | null>(null)

  useEffect(() => {
    const load = async () => {
      setError('')
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', user.id)
          .maybeSingle()
        setAdminLabel(profile?.name || profile?.email || 'Admin')
      }

      const [
        clientsRes,
        coachesRes,
        plansRes,
        pendingRes,
        checkinsRes,
        deliveredRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('coaches').select('id', { count: 'exact', head: true }),
        supabase.from('plans').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_complete', false),
        supabase
          .from('checkins')
          .select('id, submitted_at, client_id, profiles:client_id(name, email)')
          .order('submitted_at', { ascending: false })
          .limit(5),
        supabase
          .from('plans')
          .select('id, delivered_at, title, profiles:client_id(name, email)')
          .not('delivered_at', 'is', null)
          .order('delivered_at', { ascending: false })
          .limit(5),
      ])

      if (clientsRes.error || coachesRes.error || plansRes.error || pendingRes.error) {
        setError('Failed to load dashboard stats.')
        setLoading(false)
        return
      }

      setStats({
        clients: clientsRes.count ?? 0,
        coaches: coachesRes.count ?? 0,
        activePlans: plansRes.count ?? 0,
        pendingOnboarding: pendingRes.count ?? 0,
      })

      const items: ActivityItem[] = []

      for (const c of checkinsRes.data ?? []) {
        const profile = c.profiles as { name?: string; email?: string } | null
        items.push({
          id: `checkin-${c.id}`,
          type: 'checkin',
          label: `Check-in from ${profile?.name || profile?.email || 'client'}`,
          at: c.submitted_at,
        })
      }

      for (const p of deliveredRes.data ?? []) {
        const profile = p.profiles as { name?: string; email?: string } | null
        items.push({
          id: `plan-${p.id}`,
          type: 'plan',
          label: `Plan delivered: ${p.title} — ${profile?.name || profile?.email || 'client'}`,
          at: p.delivered_at as string,
        })
      }

      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      setActivity(items.slice(0, 8))

      try {
        const [healthRes, promptStatsRes] = await Promise.all([
          fetch('/api/admin/platform-health'),
          fetch('/api/admin/prompts/stats'),
        ])
        if (healthRes.ok) {
          setHealth((await healthRes.json()) as PlatformHealth)
        }
        if (promptStatsRes.ok) {
          setPromptStats((await promptStatsRes.json()) as PromptLibraryStats)
        }
      } catch {
        setHealth(null)
        setPromptStats(null)
      }

      setLoading(false)
    }

    void load()
  }, [])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading dashboard…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>Founder Dashboard</h1>
          <p style={s.subtitle}>
            {adminLabel} · Business operations overview
          </p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.statGrid}>
            <AdminStatCard label="Total Clients" value={stats.clients} />
            <AdminStatCard label="Total Coaches" value={stats.coaches} accent="#e94560" />
            <AdminStatCard label="Active Plans" value={stats.activePlans} accent="#0d9488" />
            <AdminStatCard
              label="Pending Onboarding"
              value={stats.pendingOnboarding}
              accent="#d97706"
              hint={stats.pendingOnboarding > 0 ? 'Needs attention' : undefined}
            />
          </div>

          <FounderAnalyticsPanel />

          <div style={{ marginTop: 24 }}>
            <ComplexityAnalyticsPanel />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 24 }}>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Recent Activity</h2>
              {activity.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>No recent activity yet.</p>
              ) : (
                activity.map((item) => (
                  <div key={item.id} style={s.activityItem}>
                    {item.label}
                    <div style={s.activityTime}>{formatDate(item.at)}</div>
                  </div>
                ))
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Platform Health</h2>
              {health ? (
                <div style={s.infoGrid}>
                  <HealthRow
                    label="Anthropic Status"
                    value={health.anthropicStatus === 'configured' ? 'Configured' : 'Not configured'}
                  />
                  <HealthRow label="AI Provider" value={health.aiProvider} />
                  <HealthRow label="Current Model" value={health.currentModel} />
                  <HealthRow
                    label="Last Successful Generation"
                    value={health.lastSuccessfulGeneration ? formatDate(health.lastSuccessfulGeneration) : '—'}
                  />
                  <HealthRow
                    label="Average AI Latency"
                    value={health.averageLatencyMs != null ? `${health.averageLatencyMs} ms` : '—'}
                  />
                  <HealthRow
                    label="AI Success Rate"
                    value={health.aiSuccessRate != null ? `${health.aiSuccessRate}%` : '—'}
                  />
                  <HealthRow
                    label="Retry Rate"
                    value={health.retryRate != null ? `${health.retryRate}%` : '—'}
                  />
                  <HealthRow
                    label="Validation Failure Rate"
                    value={health.validationFailureRate != null ? `${health.validationFailureRate}%` : '—'}
                  />
                </div>
              ) : (
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>Health data unavailable.</p>
              )}
              {health && !health.metricsAvailable && (
                <p style={{ margin: '16px 0 0 0', fontSize: 12, color: '#888' }}>{health.metricsNote}</p>
              )}
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>Prompt Library</h2>
              {promptStats ? (
                <div style={s.infoGrid}>
                  <HealthRow label="Total prompts" value={String(promptStats.total)} />
                  <HealthRow label="Drafts" value={String(promptStats.drafts)} />
                  <HealthRow label="Published" value={String(promptStats.published)} />
                  <HealthRow
                    label="Last updated prompt"
                    value={promptStats.lastUpdated ? formatDate(promptStats.lastUpdated) : '—'}
                  />
                </div>
              ) : (
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>Prompt library data unavailable.</p>
              )}
              <Link href="/admin/prompts" style={{ ...s.linkBtn, display: 'inline-block', marginTop: 16 }}>
                Open prompt library →
              </Link>
            </div>
          </div>

          <div style={{ ...s.toolbar, marginTop: 8 }}>
            <Link href="/admin/clients" style={s.linkBtn}>Manage clients →</Link>
            <Link href="/admin/coaches" style={s.linkBtn}>View coaches →</Link>
          </div>
        </div>
      </div>
    </>
  )
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}
