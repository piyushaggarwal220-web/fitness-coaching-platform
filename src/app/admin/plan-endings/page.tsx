'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type { PlanEndingDay, PlanEndingsPayload } from '@/lib/admin/plan-endings'
import { colors } from '@/lib/design-tokens'
import { normalizePhoneForWhatsApp } from '@/lib/phone'

function renewalWhatsAppHref(client: {
  name: string | null
  email: string | null
  phone: string | null
  planName: string
}): string | null {
  const normalized = normalizePhoneForWhatsApp(client.phone)
  if (!normalized) return null
  const digits = normalized.replace(/\D/g, '')
  const firstName = (client.name || client.email || 'there').split(' ')[0]
  const text = encodeURIComponent(
    `Hi ${firstName}, this is LURVOX. Your ${client.planName} coaching seat has ended or is ending soon. Want to renew and keep your plan going?`
  )
  return `https://wa.me/${digits}?text=${text}`
}

type ViewKey = 'upcoming' | 'ended'

export default function AdminPlanEndingsPage() {
  const [data, setData] = useState<PlanEndingsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<ViewKey>('ended')
  const [openDate, setOpenDate] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError('')
      setLoading(true)
      try {
        const res = await fetch('/api/admin/plan-endings')
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error || 'Failed to load plan endings.')
        }
        const payload = (await res.json()) as PlanEndingsPayload
        setData(payload)
        setOpenDate(payload.ended[0]?.date ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plan endings.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const days = view === 'upcoming' ? data?.upcoming ?? [] : data?.ended ?? []
  const totalPlans = days.reduce((sum, day) => sum + day.count, 0)

  const openDay = days.find((day) => day.date === openDate) ?? null

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading plan endings…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>{brandTitle('Membership renewal calls')}</h1>
          <p style={s.subtitle}>
            See expired memberships with contact details so the team can call for renewal.
            Upcoming endings are included for proactive follow-up. Dates use India time
            {data ? ` (${data.summary.timezone})` : ''}.
          </p>

          {error && <div style={s.error}>{error}</div>}

          {data && (
            <div style={s.statGrid}>
              <div style={s.statCard}>
                <div style={s.statLabel}>Ending today</div>
                <div style={s.statValue}>{data.summary.endingToday}</div>
                <div style={s.statHint}>{data.summary.today}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Next 7 days</div>
                <div style={s.statValue}>{data.summary.endingNext7Days}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Next 30 days</div>
                <div style={s.statValue}>{data.summary.endingNext30Days}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Upcoming</div>
                <div style={s.statValue}>{data.summary.upcomingTotal}</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statLabel}>Renewal calls due</div>
                <div style={s.statValue}>{data.summary.alreadyEnded}</div>
                <div style={s.statHint}>Membership ended</div>
              </div>
            </div>
          )}

          <div style={s.toolbar}>
            <button
              type="button"
              style={view === 'upcoming' ? s.primaryBtn : s.secondaryBtn}
              onClick={() => {
                setView('upcoming')
                setOpenDate(null)
              }}
            >
              Upcoming endings
            </button>
            <button
              type="button"
              style={view === 'ended' ? s.primaryBtn : s.secondaryBtn}
              onClick={() => {
                setView('ended')
                setOpenDate(null)
              }}
            >
              Call for renewal
            </button>
          </div>

          {days.length === 0 ? (
            <div style={s.empty}>
              {view === 'upcoming'
                ? 'No upcoming membership endings.'
                : 'No expired memberships need renewal calls.'}
            </div>
          ) : (
            <>
              <p style={{ ...s.subtitle, marginBottom: 12 }}>
                {days.length} date{days.length === 1 ? '' : 's'} · {totalPlans} plan
                {totalPlans === 1 ? '' : 's'}
              </p>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>{view === 'ended' ? 'Renewal calls' : 'Memberships ending'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day) => (
                      <DayRow
                        key={day.date}
                        day={day}
                        open={openDate === day.date}
                        onToggle={() => setOpenDate((current) => (current === day.date ? null : day.date))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {openDay ? <ClientList day={openDay} /> : null}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function DayRow({
  day,
  open,
  onToggle,
}: {
  day: PlanEndingDay
  open: boolean
  onToggle: () => void
}) {
  return (
    <tr>
      <td style={s.td}>
        <button type="button" onClick={onToggle} style={s.linkBtn}>
          {day.label}
        </button>
      </td>
      <td style={s.td}>
        <button type="button" onClick={onToggle} style={{ ...s.linkBtn, color: colors.textPrimary }}>
          {day.count}
          <span style={{ color: colors.textMuted, fontWeight: 500, marginLeft: 8 }}>
            {open ? 'Hide names' : 'Show names'}
          </span>
        </button>
      </td>
    </tr>
  )
}

function ClientList({ day }: { day: PlanEndingDay }) {
  return (
    <div style={{ ...s.card, marginTop: 16 }}>
      <h2 style={s.cardTitle}>
        {day.label} · {day.count} plan{day.count === 1 ? '' : 's'}
      </h2>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Client</th>
              <th style={s.th}>Phone</th>
              <th style={s.th}>Plan</th>
              <th style={s.th}>Coach</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {day.clients.map((client) => (
              <tr key={client.id}>
                <td style={s.td}>
                  <Link href={`/admin/clients/${client.id}`} style={s.linkBtn}>
                    {client.name || client.email || 'Client'}
                  </Link>
                  {client.email && client.name ? (
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{client.email}</div>
                  ) : null}
                </td>
                <td style={s.td}>
                  {client.phone ? (
                    <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} style={s.linkBtn}>
                      {client.phone}
                    </a>
                  ) : (
                    <span style={{ color: colors.textMuted }}>Not available</span>
                  )}
                </td>
                <td style={s.td}>{client.planName}</td>
                <td style={s.td}>{client.coachName || '—'}</td>
                <td style={s.td}>
                  <span
                    style={{
                      ...s.badge,
                      ...(client.seatStatus === 'grace'
                        ? s.badgeWarn
                        : client.seatStatus === 'ending'
                          ? s.badgeInfo
                          : s.badgeMuted),
                    }}
                  >
                    {client.seatStatus === 'grace'
                      ? 'Grace'
                      : client.seatStatus === 'ending'
                        ? 'Ending'
                        : 'Ended'}
                  </span>
                </td>
                <td style={s.td}>
                  {client.phone ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <a
                        href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                        style={{ ...s.primaryBtn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                      >
                        Call now
                      </a>
                      {renewalWhatsAppHref(client) ? (
                        <a
                          href={renewalWhatsAppHref(client)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...s.secondaryBtn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                        >
                          WhatsApp
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <Link href={`/admin/clients/${client.id}`} style={s.secondaryBtn}>
                      Open client
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
