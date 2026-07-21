'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import { adminStyles as s } from '@/lib/admin/styles'
import { coachBadgeStyles, formatFitnessGoal, formatDate, getCheckinStatus, getPlanStatus } from '@/lib/coach-utils'
import { ComplexityHistoryTimeline } from '@/components/complexity/ComplexityHistoryTimeline'
import { ComplexityScoreCard } from '@/components/complexity/ComplexityScoreCard'
import { CoachClientProfileEdit } from '@/components/coach/CoachClientProfileEdit'
import { createClient } from '@/lib/supabase/client'
import { useAdminRole } from '@/lib/admin/use-admin-role'
import { formatHeight } from '@/lib/height'
import type { Coach, CoachClientDetail } from '@/types/database'

const supabase = createClient()

export default function AdminClientDetailPage() {
  const params = useParams()
  const clientId = typeof params.id === 'string' ? params.id : ''

  const [client, setClient] = useState<CoachClientDetail | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { role } = useAdminRole()

  useEffect(() => {
    const load = async () => {
      if (!clientId) return
      setError('')

      const [clientRes, coachesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
        supabase.from('coaches').select('id, name, user_id, hard_cap').order('name'),
      ])

      if (clientRes.error || !clientRes.data) {
        setError('Client not found.')
        setLoading(false)
        return
      }

      const row = clientRes.data as CoachClientDetail
      setClient(row)
      setSelectedCoachId(row.coach_id ?? '')
      setCoaches((coachesRes.data as Coach[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [clientId])

  const handleAssign = async () => {
    if (!client) return
    setSaving(true)
    setError('')
    setSuccess('')

    const coachId = selectedCoachId || null
    const { error: assignError } = await assignCoachToClient(supabase, client.id, coachId)

    setSaving(false)
    if (assignError) {
      setError(assignError)
      return
    }

    setClient({ ...client, coach_id: coachId })
    setSuccess(coachId ? 'Coach assignment updated.' : 'Coach unassigned.')
  }

  if (!clientId) {
    return (
      <>
        <AdminNavbar />
        <div style={s.container}><div style={s.error}>Invalid client ID.</div></div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading client…</div>
      </>
    )
  }

  if (error && !client) {
    return (
      <>
        <AdminNavbar />
        <div style={s.container}>
          <Link href="/admin/clients" style={s.backLink}>← Back to clients</Link>
          <div style={s.errorBox}>{error}</div>
        </div>
      </>
    )
  }

  if (!client) return null

  const assignedCoach = coaches.find((c) => c.id === client.coach_id)
  const canDelete = role === 'super_admin'

  const handleDelete = async () => {
    if (!canDelete) return
    if (!clientId) return

    const confirm = window.prompt(
      'You are about to permanently delete this client and all associated data.\n\nThis action cannot be undone.\n\nType DELETE to confirm.'
    )
    if (confirm !== 'DELETE') return

    const reason = window.prompt('Reason (optional):') ?? null

    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Delete failed')

      window.location.href = '/admin/clients'
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
          <Link href="/admin/clients" style={s.backLink}>← Back to clients</Link>

          <h1 style={s.title}>{client.name || 'Unnamed client'}</h1>
          <p style={s.subtitle}>{client.email || 'No email'}</p>

          {error && <div style={s.error}>{error}</div>}
          {success && <div style={{ ...s.error, backgroundColor: '#d4edda', color: '#155724' }}>{success}</div>}

          <ComplexityScoreCard
            score={client.complexity_score}
            tier={client.complexity_tier}
            previousScore={client.complexity_previous_score}
            scoreChange={client.complexity_score_change}
            lastCalculatedAt={client.complexity_last_calculated_at}
          />

          <div style={s.card}>
            <h2 style={s.cardTitle}>Complexity History</h2>
            <ComplexityHistoryTimeline clientId={client.id} />
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Profile</h2>
            <div style={s.infoGrid}>
              <Info label="Goal" value={formatFitnessGoal(client.fitness_goal)} />
              <Info label="Age" value={client.age != null ? String(client.age) : '—'} />
              <Info label="Height" value={formatHeight(client.height)} />
              <Info label="Weight" value={client.weight != null ? `${client.weight} kg` : '—'} />
              <Info label="Onboarding" value={client.onboarding_complete ? 'Complete' : 'Pending'} />
              <Info label="Plan" value={getPlanStatus(client)} />
              <Info label="Check-in" value={getCheckinStatus(client)} />
              <Info label="Updated" value={formatDate(client.updated_at)} />
            </div>
            <CoachClientProfileEdit
              client={client}
              trigger="profile_edit_admin"
              onSaved={setClient}
            />
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Coach assignment</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#666' }}>
              Current coach: {assignedCoach?.name || (client.coach_id ? 'Unknown coach' : 'Unassigned')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                style={{ ...s.select, flex: '1 1 240px' }}
              >
                <option value="">— Unassigned —</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name || 'Coach'} {coach.hard_cap ? `(cap ${coach.hard_cap})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleAssign()}
                style={s.primaryBtn}
              >
                {saving ? 'Saving…' : 'Save assignment'}
              </button>
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Status badges</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={client.plan_delivered ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
                Plan {getPlanStatus(client)}
              </span>
              <span
                style={
                  getCheckinStatus(client) === 'Overdue'
                    ? coachBadgeStyles.overdue
                    : getCheckinStatus(client) === 'Awaiting'
                      ? coachBadgeStyles.awaiting
                      : coachBadgeStyles.ok
                }
              >
                Check-in {getCheckinStatus(client)}
              </span>
              {!client.onboarding_complete && (
                <span style={coachBadgeStyles.new}>Onboarding incomplete</span>
              )}
            </div>
          </div>

          {canDelete && (
            <div style={{ ...s.card, border: '1px solid rgba(185, 28, 28, 0.35)' }}>
              <h2 style={{ ...s.cardTitle, color: '#b91c1c' }}>Danger zone</h2>
              <p style={{ margin: '0 0 12px 0', color: '#7f1d1d', fontSize: 14, lineHeight: 1.5 }}>
                Delete this client permanently, including all coaching data and their authentication account. This action
                cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{
                  ...s.primaryBtn,
                  backgroundColor: '#b91c1c',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete client'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}
