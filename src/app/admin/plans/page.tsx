'use client'

import { useEffect, useState } from 'react'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatDate } from '@/lib/coach-utils'
import { formatPlanDate } from '@/lib/plans'
import { createClient } from '@/lib/supabase/client'
import type { Plan } from '@/types/database'

const supabase = createClient()

type ActivePlanRow = Plan & {
  profiles?: { name: string | null; email: string | null } | null
  coaches?: { name: string | null } | null
}

export default function AdminActivePlansPage() {
  const [plans, setPlans] = useState<ActivePlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')

      const { data, error: loadError } = await supabase
        .from('plans')
        .select('*, profiles:client_id(name, email), coaches:coach_id(name)')
        .eq('active', true)
        .order('updated_at', { ascending: false })

      if (loadError) {
        setError('Failed to load active plans.')
        setLoading(false)
        return
      }

      setPlans((data as ActivePlanRow[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading active plans…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>Active Plans</h1>
          <p style={s.subtitle}>{plans.length} plans currently delivered to clients</p>

          {error && <div style={s.error}>{error}</div>}

          {plans.length === 0 ? (
            <div style={s.empty}>No active plans.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Plan</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td style={s.td}>
                        <strong>{plan.profiles?.name || plan.profiles?.email || 'Client'}</strong>
                      </td>
                      <td style={s.td}>{plan.coaches?.name || '—'}</td>
                      <td style={s.td}>
                        {plan.title}
                        <div style={{ fontSize: 12, color: '#888' }}>v{plan.version}</div>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...s.badgeOk }}>Active</span>
                        {plan.delivered_at && (
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            Delivered {formatDate(plan.delivered_at)}
                          </div>
                        )}
                      </td>
                      <td style={s.td}>{formatPlanDate(plan.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
            Read-only view. Coaches manage plans from the coach portal.
          </p>
        </div>
      </div>
    </>
  )
}
