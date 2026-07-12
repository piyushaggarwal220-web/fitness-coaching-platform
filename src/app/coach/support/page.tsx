'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { CoachShell } from '@/components/ui/CoachShell'
import { priorityBadgeStyle, statusBadgeStyle, supportStyles as s } from '@/components/support/styles'
import { requireCoach } from '@/lib/coach-session'
import {
  anonymizedClientSummary,
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { Coach, SupportRequestWithClient } from '@/types/database'

const supabase = createClient()

type Tab = 'open' | 'claimed' | 'closed'

export default function CoachSupportPage() {
  const router = useRouter()
  const [coach, setCoach] = useState<Coach | null>(null)
  const [requests, setRequests] = useState<SupportRequestWithClient[]>([])
  const [tab, setTab] = useState<Tab>('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')
      const coachData = await requireCoach(supabase, router)
      if (!coachData) return
      setCoach(coachData)

      const [openRes, mineRes] = await Promise.all([
        supabase
          .from('support_requests')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false }),
        supabase
          .from('support_requests')
          .select('*, profiles:client_id(name, email, age, gender, fitness_goal)')
          .eq('claimed_by', coachData.id)
          .order('updated_at', { ascending: false }),
      ])

      if (openRes.error || mineRes.error) {
        setError('Failed to load support queue.')
        setLoading(false)
        return
      }

      const open = (openRes.data as SupportRequestWithClient[]) ?? []
      const mine = (mineRes.data as SupportRequestWithClient[]) ?? []
      const merged = [...open, ...mine.filter((m) => m.status !== 'open')]
      const unique = Array.from(new Map(merged.map((r) => [r.id, r])).values())
      setRequests(unique)
      setLoading(false)
    }

    void load()
  }, [router])

  const filtered = useMemo(() => {
    if (!coach) return []
    if (tab === 'open') return requests.filter((r) => r.status === 'open')
    if (tab === 'claimed') return requests.filter((r) => r.status === 'claimed' && r.claimed_by === coach.id)
    return requests.filter((r) => r.status === 'closed' && r.claimed_by === coach.id)
  }, [requests, tab, coach])

  if (loading) {
    return <CoachShell loading><span /></CoachShell>
  }

  return (
    <CoachShell>
          <h1 style={s.title}>{brandTitle('Support queue')}</h1>
          <p style={s.subtitle}>Structured coaching requests · shared open queue</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.tabs}>
            {(['open', 'claimed', 'closed'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                style={tab === t ? s.tabActive : s.tab}
                onClick={() => setTab(t)}
              >
                {t === 'open' ? 'Open requests' : t === 'claimed' ? 'Claimed by me' : 'Closed'}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>No requests in this queue.</div>
          ) : (
            <div style={s.inboxList}>
              {filtered.map((req) => {
                const anonymous = req.status === 'open'
                const summary = anonymizedClientSummary(req.profiles, req.client_id, {
                  client_age: req.client_age,
                  client_gender: req.client_gender,
                  client_goal: req.client_goal,
                })
                const priorityStyle = priorityBadgeStyle(req.priority)

                return (
                  <Link key={req.id} href={`/coach/support/${req.id}`} style={s.inboxItem}>
                    <p style={s.inboxTitle}>{req.title}</p>
                    <div style={s.inboxMeta}>
                      <span style={{ ...s.badge, ...statusBadgeStyle(req.status) }}>{req.status}</span>
                      <span>{formatSupportCategory(req.category)}</span>
                      {priorityStyle && (
                        <span style={{ ...s.badge, ...priorityStyle }}>{formatSupportPriority(req.priority)}</span>
                      )}
                      <span>
                        {anonymous
                          ? `${summary.label} · ${summary.age} yrs · ${summary.gender} · ${summary.goal}`
                          : req.profiles?.name || req.profiles?.email || summary.label}
                      </span>
                      <span>{formatSupportDate(req.updated_at)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
    </CoachShell>
  )
}
