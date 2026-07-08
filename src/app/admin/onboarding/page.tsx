'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { adminStyles as s } from '@/lib/admin/styles'
import { coachBadgeStyles, formatDate, formatFitnessGoal } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { ClientProfile } from '@/types/database'

const supabase = createClient()

export default function AdminPendingOnboardingPage() {
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')
      setLoading(true)

      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'client')
        .eq('onboarding_complete', false)
        .order('updated_at', { ascending: false })

      if (loadError) {
        setError('Failed to load pending onboarding.')
      } else {
        setClients((data as ClientProfile[]) ?? [])
      }
      setLoading(false)
    }

    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const name = (c.name ?? '').toLowerCase()
      const email = (c.email ?? '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [clients, search])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading pending onboarding…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>Pending Onboarding</h1>
          <p style={s.subtitle}>{clients.length} clients have not completed onboarding</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.searchInput}
            />
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>All clients have completed onboarding.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Goal</th>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Last updated</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr key={client.id}>
                      <td style={s.td}>
                        <strong>{client.name || 'Unnamed'}</strong>
                        <div style={{ fontSize: 12, color: '#888' }}>{client.email}</div>
                      </td>
                      <td style={s.td}>{formatFitnessGoal(client.fitness_goal)}</td>
                      <td style={s.td}>
                        {client.coach_id ? (
                          <span style={coachBadgeStyles.ok}>Assigned</span>
                        ) : (
                          <span style={coachBadgeStyles.pending}>Unassigned</span>
                        )}
                      </td>
                      <td style={s.td}>{formatDate(client.updated_at)}</td>
                      <td style={s.td}>
                        <Link href={`/admin/clients/${client.id}`} style={s.linkBtn}>View</Link>
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
