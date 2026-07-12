'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/admin/AdminShell'
import { priorityBadgeStyle, statusBadgeStyle } from '@/components/support/styles'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import {
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
  formatSupportStatus,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { SupportRequestWithClient } from '@/types/database'

const supabase = createClient()

type StatusFilter = 'all' | 'open' | 'claimed' | 'closed'

export default function AdminSupportPage() {
  const [requests, setRequests] = useState<SupportRequestWithClient[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')

      const { data, error: fetchError } = await supabase
        .from('support_requests')
        .select(
          '*, profiles:client_id(name, email), coaches:claimed_by(name)'
        )
        .order('updated_at', { ascending: false })

      if (fetchError) {
        setError('Failed to load support requests.')
        setLoading(false)
        return
      }

      setRequests((data as SupportRequestWithClient[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [])

  const filtered = useMemo(() => {
    let list = [...requests]
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => {
      const client = (r.profiles?.name || r.profiles?.email || '').toLowerCase()
      const coach = (r.coaches?.name || '').toLowerCase()
      return (
        r.title.toLowerCase().includes(q) ||
        client.includes(q) ||
        coach.includes(q) ||
        r.category.includes(q)
      )
    })
  }, [requests, statusFilter, search])

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading support queue…</div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>{brandTitle('Support Queue')}</h1>
          <p style={s.subtitle}>
            Admin oversight of all client coaching requests · {requests.length} total
          </p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search by title, client, coach…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.searchInput}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={s.select}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="claimed">Claimed</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>No support requests match your filters.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Updated</th>
                    <th style={s.th}>Title</th>
                    <th style={s.th}>Client</th>
                    <th style={s.th}>Coach</th>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Priority</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((req) => {
                    const priorityStyle = priorityBadgeStyle(req.priority)
                    return (
                      <tr key={req.id}>
                        <td style={s.td}>{formatSupportDate(req.updated_at)}</td>
                        <td style={s.td}>
                          <strong>{req.title}</strong>
                        </td>
                        <td style={s.td}>
                          {req.profiles?.name || req.profiles?.email || '—'}
                        </td>
                        <td style={s.td}>{req.coaches?.name || '—'}</td>
                        <td style={s.td}>{formatSupportCategory(req.category)}</td>
                        <td style={s.td}>
                          {priorityStyle ? (
                            <span style={{ ...s.badge, ...priorityStyle }}>
                              {formatSupportPriority(req.priority)}
                            </span>
                          ) : (
                            formatSupportPriority(req.priority)
                          )}
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, ...statusBadgeStyle(req.status) }}>
                            {formatSupportStatus(req.status)}
                          </span>
                        </td>
                        <td style={s.td}>
                          <Link href={`/admin/support/${req.id}`} style={s.linkBtn}>
                            View
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
            Read-only oversight. Coaches manage claims and replies from the coach portal.
          </p>
        </div>
      </div>
    </AdminShell>
  )
}
