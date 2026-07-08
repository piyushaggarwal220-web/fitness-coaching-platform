'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { adminStyles as s } from '@/lib/admin/styles'
import { coachBadgeStyles, formatFitnessGoal, getCheckinStatus, getPlanStatus } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import { useAdminRole } from '@/lib/admin/use-admin-role'
import type { ClientProfile, Coach } from '@/types/database'

const supabase = createClient()

export default function AdminCoachDetailPage() {
  const params = useParams()
  const coachId = typeof params.id === 'string' ? params.id : ''

  const [coach, setCoach] = useState<Coach | null>(null)
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [allCoaches, setAllCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  const [error, setError] = useState('')
  const { role } = useAdminRole()

  useEffect(() => {
    const load = async () => {
      if (!coachId) return
      setError('')

      const [coachRes, clientsRes] = await Promise.all([
        supabase.from('coaches').select('id, name, user_id, hard_cap').eq('id', coachId).maybeSingle(),
        supabase.from('profiles').select('*').eq('coach_id', coachId).eq('role', 'client').order('name'),
      ])
      const { data: coachesList } = await supabase
        .from('coaches')
        .select('id, name, user_id, hard_cap')
        .order('name')

      if (coachRes.error || !coachRes.data) {
        setError('Coach not found.')
        setLoading(false)
        return
      }

      setCoach(coachRes.data as Coach)
      setClients((clientsRes.data as ClientProfile[]) ?? [])
      setAllCoaches((coachesList as Coach[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [coachId])

  if (!coachId) {
    return (
      <>
        <AdminNavbar />
        <div style={s.container}><div style={s.error}>Invalid coach ID.</div></div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading coach…</div>
      </>
    )
  }

  if (error && !coach) {
    return (
      <>
        <AdminNavbar />
        <div style={s.container}>
          <Link href="/admin/coaches" style={s.backLink}>← Back to coaches</Link>
          <div style={s.errorBox}>{error}</div>
        </div>
      </>
    )
  }

  if (!coach) return null

  const activeCount = clients.filter((c) => c.plan_delivered).length
  const pendingCount = clients.filter((c) => c.checkin_awaiting || c.checkin_overdue || !c.plan_delivered).length
  const canDelete = role === 'super_admin'
  const otherCoaches = allCoaches.filter((c) => c.id !== coach.id)

  const handleDelete = async () => {
    if (!canDelete) return
    if (!coachId) return

    const confirm = window.prompt(
      `You are about to permanently delete this coach and all associated data.\n\nThis action cannot be undone.\n\nType DELETE to confirm.`
    )
    if (confirm !== 'DELETE') return

    if (clients.length > 0 && !reassignTo) {
      setError(`This coach currently has ${clients.length} active clients. Select a coach to reassign them first.`)
      return
    }

    const reason = window.prompt('Reason (optional):') ?? null

    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/coaches/${coachId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, reassignToCoachId: clients.length > 0 ? reassignTo : null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Delete failed')
      window.location.href = '/admin/coaches'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.container}>
          <Link href="/admin/coaches" style={s.backLink}>← Back to coaches</Link>

          <h1 style={s.title}>{coach.name || 'Coach'}</h1>
          <p style={s.subtitle}>
            {clients.length} assigned clients · {activeCount} active · {pendingCount} pending work
          </p>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Coach info</h2>
            <div style={s.infoGrid}>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Capacity</span>
                <span style={s.infoValue}>{coach.hard_cap ?? 'Not set'}</span>
              </div>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Assigned clients</span>
                <span style={s.infoValue}>{clients.length}</span>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Assigned clients</h2>
            {clients.length === 0 ? (
              <p style={{ margin: 0, color: '#666' }}>No clients assigned.</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Client</th>
                      <th style={s.th}>Goal</th>
                      <th style={s.th}>Plan</th>
                      <th style={s.th}>Check-in</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id}>
                        <td style={s.td}>
                          <strong>{client.name || 'Unnamed'}</strong>
                          <div style={{ fontSize: 12, color: '#888' }}>{client.email}</div>
                        </td>
                        <td style={s.td}>{formatFitnessGoal(client.fitness_goal)}</td>
                        <td style={s.td}>
                          <span style={getPlanStatus(client) === 'Delivered' ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
                            {getPlanStatus(client)}
                          </span>
                        </td>
                        <td style={s.td}>{getCheckinStatus(client)}</td>
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

          {canDelete && (
            <div style={{ ...s.card, border: '1px solid rgba(185, 28, 28, 0.35)' }}>
              <h2 style={{ ...s.cardTitle, color: '#b91c1c' }}>Danger zone</h2>
              <p style={{ margin: '0 0 12px 0', color: '#7f1d1d', fontSize: 14, lineHeight: 1.5 }}>
                Delete this coach permanently, including their authentication account. If they have assigned clients,
                you must reassign them before deletion.
              </p>

              {clients.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                    This coach currently has <strong>{clients.length}</strong> active clients.
                  </div>
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    style={{ ...s.select, flex: '1 1 240px' }}
                  >
                    <option value="">Select coach to reassign clients…</option>
                    {otherCoaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Coach'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{
                  ...s.primaryBtn,
                  backgroundColor: '#b91c1c',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete coach'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
