'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { requireAdmin } from '@/lib/admin-session'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatInr } from '@/lib/admin/pricing'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseListResult } from '@/lib/admin/business-analytics'

const supabase = createClient()

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export default function AdminPurchasesPage() {
  const router = useRouter()
  const [result, setResult] = useState<PurchaseListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<SortKey>('date_desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      const admin = await requireAdmin(supabase, router)
      if (!admin || cancelled) return

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        sort,
      })
      if (search.trim()) params.set('search', search.trim())
      if (status !== 'all') params.set('status', status)
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      try {
        const res = await fetch(`/api/admin/purchases?${params.toString()}`)
        if (!res.ok) throw new Error('Failed to load purchases')
        if (!cancelled) setResult((await res.json()) as PurchaseListResult)
      } catch {
        if (!cancelled) {
          setError('Failed to load purchases.')
          setResult(null)
        }
      }
      if (!cancelled) setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [router, page, search, status, from, to, sort])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  if (loading && !result) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading purchases…</div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.containerWide}>
          <h1 style={s.title}>Purchases</h1>
          <p style={s.subtitle}>Payment history and Razorpay transaction records.</p>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search customer, product, Razorpay IDs…"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              style={s.searchInput}
            />
            <select
              value={status}
              onChange={(e) => {
                setPage(1)
                setStatus(e.target.value)
              }}
              style={s.select}
            >
              <option value="all">All statuses</option>
              <option value="captured">Captured</option>
            </select>
            <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value) }} style={s.select} />
            <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value) }} style={s.select} />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={s.select}>
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Amount high → low</option>
              <option value="amount_asc">Amount low → high</option>
            </select>
          </div>

          {!result || result.rows.length === 0 ? (
            <div style={s.empty}>No purchases found.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Customer</th>
                    <th style={s.th}>Product</th>
                    <th style={s.th}>Amount</th>
                    <th style={s.th}>Payment Status</th>
                    <th style={s.th}>Razorpay Order ID</th>
                    <th style={s.th}>Razorpay Payment ID</th>
                    <th style={s.th}>Purchase Date</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((purchase) => (
                    <tr key={purchase.id}>
                      <td style={s.td}>
                        <strong>{purchase.profiles?.name || purchase.customer_name || '—'}</strong>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {purchase.profiles?.email || purchase.customer_email}
                        </div>
                      </td>
                      <td style={s.td}>{purchase.plan_name}</td>
                      <td style={s.td}>{formatInr(purchase.amount_paise / 100)}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...(purchase.status === 'captured' ? s.badgeOk : s.badgeWarn) }}>
                          {purchase.status}
                        </span>
                      </td>
                      <td style={s.td}>
                        <code style={{ fontSize: 11 }}>{purchase.razorpay_order_id}</code>
                      </td>
                      <td style={s.td}>
                        <code style={{ fontSize: 11 }}>{purchase.razorpay_payment_id}</code>
                      </td>
                      <td style={s.td}>{formatDate(purchase.created_at)}</td>
                      <td style={s.td}>
                        <Link href={`/admin/purchases/${purchase.id}`} style={s.linkBtn}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.total > result.pageSize && (
            <div style={{ ...s.toolbar, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={s.secondaryBtn}>
                Previous
              </button>
              <span style={{ fontSize: 14, color: '#666' }}>
                Page {page} of {totalPages} · {result.total} purchases
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={s.secondaryBtn}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
