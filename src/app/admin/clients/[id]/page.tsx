'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import { requireAdmin } from '@/lib/admin-session'
import { adminStyles as s } from '@/lib/admin/styles'
import { coachBadgeStyles, formatFitnessGoal, formatDate, getCheckinStatus, getPlanStatus } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { Coach, CoachClientDetail } from '@/types/database'

const supabase = createClient()

export default function AdminClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = typeof params.id === 'string' ? params.id : ''

  const [client, setClient] = useState<CoachClientDetail | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!clientId) return
      setError('')
      const admin = await requireAdmin(supabase, router)
      if (!admin) return

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
  }, [clientId, router])

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

          <div style={s.card}>
            <h2 style={s.cardTitle}>Profile</h2>
            <div style={s.infoGrid}>
              <Info label="Goal" value={formatFitnessGoal(client.fitness_goal)} />
              <Info label="Age" value={client.age != null ? String(client.age) : '—'} />
              <Info label="Weight" value={client.weight != null ? `${client.weight} kg` : '—'} />
              <Info label="Onboarding" value={client.onboarding_complete ? 'Complete' : 'Pending'} />
              <Info label="Plan" value={getPlanStatus(client)} />
              <Info label="Check-in" value={getCheckinStatus(client)} />
              <Info label="Updated" value={formatDate(client.updated_at)} />
            </div>
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
