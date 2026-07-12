'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { createClient } from '@/lib/supabase/client'
import type { ClientProfile, Coach } from '@/types/database'

const supabase = createClient()

type CoachWithStats = Coach & {
  clientCount: number
  activeClients: number
  pendingWork: number
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<CoachWithStats[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')

      const [coachesRes, clientsRes] = await Promise.all([
        supabase.from('coaches').select('id, name, user_id, hard_cap').order('name'),
        supabase.from('profiles').select('coach_id, plan_delivered, checkin_awaiting, checkin_overdue').eq('role', 'client'),
      ])

      if (coachesRes.error || clientsRes.error) {
        setError('Failed to load coaches.')
        setLoading(false)
        return
      }

      const clients = (clientsRes.data ?? []) as Pick<
        ClientProfile,
        'coach_id' | 'plan_delivered' | 'checkin_awaiting' | 'checkin_overdue'
      >[]

      const stats = new Map<string, { total: number; active: number; pending: number }>()
      for (const c of clients) {
        if (!c.coach_id) continue
        const cur = stats.get(c.coach_id) ?? { total: 0, active: 0, pending: 0 }
        cur.total += 1
        if (c.plan_delivered) cur.active += 1
        if (c.checkin_awaiting || c.checkin_overdue || !c.plan_delivered) cur.pending += 1
        stats.set(c.coach_id, cur)
      }

      const rows: CoachWithStats[] = ((coachesRes.data as Coach[]) ?? []).map((coach) => {
        const st = stats.get(coach.id) ?? { total: 0, active: 0, pending: 0 }
        return {
          ...coach,
          clientCount: st.total,
          activeClients: st.active,
          pendingWork: st.pending,
        }
      })

      setCoaches(rows)
      setLoading(false)
    }

    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return coaches
    return coaches.filter((c) => (c.name ?? '').toLowerCase().includes(q))
  }, [coaches, search])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading coaches…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>{brandTitle('Coaches')}</h1>
          <p style={s.subtitle}>{coaches.length} coaches on the platform</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search coaches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.searchInput}
            />
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>No coaches found.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Clients</th>
                    <th style={s.th}>Active</th>
                    <th style={s.th}>Pending work</th>
                    <th style={s.th}>Capacity</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((coach) => (
                    <tr key={coach.id}>
                      <td style={s.td}><strong>{coach.name || 'Unnamed'}</strong></td>
                      <td style={s.td}>{coach.clientCount}</td>
                      <td style={s.td}>{coach.activeClients}</td>
                      <td style={s.td}>{coach.pendingWork}</td>
                      <td style={s.td}>{coach.hard_cap ?? '—'}</td>
                      <td style={s.td}>
                        <Link href={`/admin/coaches/${coach.id}`} style={s.linkBtn}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
