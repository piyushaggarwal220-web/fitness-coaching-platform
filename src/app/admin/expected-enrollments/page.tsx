'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type {
  ExpectedEnrollmentDay,
  ExpectedEnrollmentsPayload,
} from '@/lib/admin/expected-enrollments'
import { colors } from '@/lib/design-tokens'
import { formatDate } from '@/lib/coach-utils'

export default function AdminExpectedEnrollmentsPage() {
  const [data, setData] = useState<ExpectedEnrollmentsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError('')
      setLoading(true)
      try {
        const res = await fetch('/api/admin/expected-enrollments')
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error || 'Failed to load expected enrollments.')
        }
        setData((await res.json()) as ExpectedEnrollmentsPayload)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load expected enrollments.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const rows = useMemo(() => {
    if (!data) return [] as ExpectedEnrollmentDay[]
    const list: ExpectedEnrollmentDay[] = []
    if (data.overdue) list.push(data.overdue)
    list.push(...data.byExpectedDay)
    if (data.anytime) list.push(data.anytime)
    return list
  }, [data])

  const openDay = rows.find((day) => day.date === openKey) ?? null

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading expected enrollments…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>{brandTitle('Expected enrollments')}</h1>
          <p style={s.subtitle}>
            Open consult leads who have not paid yet, grouped by the day we expect to call them.
            Dates use India time{data ? ` (${data.summary.timezone})` : ''}.
          </p>

          {error && <div style={s.error}>{error}</div>}

          {data && (
            <div style={s.statGrid}>
              <div style={s.statCard}>
                <div style={s.statLabel}>Open leads</div>
                <div style={s.statValue}>{data.summary.openLeads}</div>
                <div style={s.statHint}>Not enrolled yet</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Expected today</div>
                <div style={s.statValue}>{data.summary.expectedToday}</div>
                <div style={s.statHint}>{data.summary.today}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Expected tomorrow</div>
                <div style={s.statValue}>{data.summary.expectedTomorrow}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Overdue follow-up</div>
                <div style={s.statValue}>{data.summary.overdue}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Anytime / unset</div>
                <div style={s.statValue}>{data.summary.anytimeOrUnspecified}</div>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div style={s.empty}>No open enrollments expected right now.</div>
          ) : (
            <>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Day</th>
                      <th style={s.th}>People expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((day) => (
                      <tr key={day.date}>
                        <td style={s.td}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenKey((current) => (current === day.date ? null : day.date))
                            }
                            style={s.linkBtn}
                          >
                            {day.label}
                          </button>
                        </td>
                        <td style={s.td}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenKey((current) => (current === day.date ? null : day.date))
                            }
                            style={{ ...s.linkBtn, color: colors.textPrimary }}
                          >
                            {day.count}
                            <span style={{ color: colors.textMuted, fontWeight: 500, marginLeft: 8 }}>
                              {openKey === day.date ? 'Hide names' : 'Show names'}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {openDay ? (
                <div style={{ ...s.card, marginTop: 16 }}>
                  <h2 style={s.cardTitle}>
                    {openDay.label} · {openDay.count} {openDay.count === 1 ? 'person' : 'people'}
                  </h2>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Name</th>
                          <th style={s.th}>Phone</th>
                          <th style={s.th}>Preferred time</th>
                          <th style={s.th}>Goal</th>
                          <th style={s.th}>Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openDay.leads.map((lead) => (
                          <tr key={lead.id}>
                            <td style={s.td}>
                              <div>{lead.name || '—'}</div>
                              {lead.email && lead.email !== '—' ? (
                                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                                  {lead.email}
                                </div>
                              ) : null}
                            </td>
                            <td style={s.td}>{lead.phone || '—'}</td>
                            <td style={s.td}>{lead.preferredTime || 'Not set'}</td>
                            <td style={s.td}>
                              <div style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{lead.goal}</div>
                            </td>
                            <td style={s.td}>{formatDate(lead.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  )
}
