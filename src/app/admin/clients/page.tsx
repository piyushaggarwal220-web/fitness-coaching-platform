'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { adminStyles as s } from '@/lib/admin/styles'
import { coachBadgeStyles, formatFitnessGoal, getCheckinStatus, getPlanStatus } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { ClientProfile, Coach } from '@/types/database'

const supabase = createClient()

type FilterKey = 'all' | 'unassigned' | 'pending_plan' | 'pending_onboarding'

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')

      const [clientsRes, coachesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'client').order('name', { ascending: true }),
        supabase.from('coaches').select('id, name, user_id, hard_cap'),
      ])

      if (clientsRes.error || coachesRes.error) {
        setError('Failed to load clients.')
        setLoading(false)
        return
      }

      setClients((clientsRes.data as ClientProfile[]) ?? [])
      setCoaches((coachesRes.data as Coach[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [])

  const coachMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of coaches) map.set(c.id, c.name || 'Coach')
    return map
  }, [coaches])

  const filtered = useMemo(() => {
    let list = [...clients]

    if (filter === 'unassigned') list = list.filter((c) => !c.coach_id)
    if (filter === 'pending_plan') list = list.filter((c) => !c.plan_delivered)
    if (filter === 'pending_onboarding') list = list.filter((c) => c.onboarding_complete === false)

    const q = search.trim().toLowerCase()
    if (!q) return list

    return list.filter((c) => {
      const name = (c.name ?? '').toLowerCase()
      const email = (c.email ?? '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [clients, filter, search])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading clients…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>Clients</h1>
          <p style={s.subtitle}>{clients.length} registered clients</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.searchInput}
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} style={s.select}>
              <option value="all">All clients</option>
              <option value="unassigned">Unassigned</option>
              <option value="pending_plan">Plan pending</option>
              <option value="pending_onboarding">Onboarding incomplete</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>No clients match your filters.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Goal</th>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Plan</th>
                    <th style={s.th}>Check-in</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr key={client.id}>
                      <td style={s.td}>
                        <strong>{client.name || 'Unnamed'}</strong>
                        <div style={{ fontSize: 12, color: '#888' }}>{client.email || '—'}</div>
                      </td>
                      <td style={s.td}>{formatFitnessGoal(client.fitness_goal)}</td>
                      <td style={s.td}>
                        {client.coach_id ? (
                          coachMap.get(client.coach_id) ?? 'Assigned'
                        ) : (
                          <span style={coachBadgeStyles.pending}>Unassigned</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={getPlanStatus(client) === 'Delivered' ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
                          {getPlanStatus(client)}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span
                          style={
                            getCheckinStatus(client) === 'Overdue'
                              ? coachBadgeStyles.overdue
                              : getCheckinStatus(client) === 'Awaiting'
                                ? coachBadgeStyles.awaiting
                                : coachBadgeStyles.ok
                          }
                        >
                          {getCheckinStatus(client)}
                        </span>
                      </td>
                      <td style={s.td}>
                        <Link href={`/admin/clients/${client.id}`} style={s.linkBtn}>
                          View
                        </Link>
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
