'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/app/components/Navbar'
import { priorityBadgeStyle, statusBadgeStyle, supportStyles as s } from '@/components/support/styles'
import { brandTitle } from '@/lib/brand'
import { authenticateClient } from '@/lib/onboarding'
import {
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
  formatSupportStatus,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { SupportRequest } from '@/types/database'

const supabase = createClient()

export default function ClientSupportPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!auth) {
        setLoading(false)
        return
      }

      if (!auth.profile) {
        setLoading(false)
        return
      }

      const { data, error: loadError } = await supabase
        .from('support_requests')
        .select('*')
        .eq('client_id', auth.profile.id)
        .order('updated_at', { ascending: false })

      if (loadError) {
        setError('Failed to load support requests.')
        setLoading(false)
        return
      }

      setRequests((data as SupportRequest[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [router])

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={s.loading}>Loading support…</div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div style={s.page}>
        <div style={s.container}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div>
              <h1 style={s.title}>{brandTitle('Support')}</h1>
              <p style={{ ...s.subtitle, marginBottom: 0 }}>Submit structured coaching requests to your coach.</p>
            </div>
            <Link href="/client/support/new" style={{ ...s.primaryBtn, textDecoration: 'none', alignSelf: 'center' }}>
              New request
            </Link>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {requests.length === 0 ? (
            <div style={s.empty}>
              <p style={{ margin: '0 0 12px 0' }}>No support requests yet.</p>
              <Link href="/client/support/new" style={s.backLink}>Create your first request →</Link>
            </div>
          ) : (
            <div style={s.inboxList}>
              {requests.map((req) => {
                const priorityStyle = priorityBadgeStyle(req.priority)
                return (
                  <Link key={req.id} href={`/client/support/${req.id}`} style={s.inboxItem}>
                    <p style={s.inboxTitle}>{req.title}</p>
                    <div style={s.inboxMeta}>
                      <span style={{ ...s.badge, ...statusBadgeStyle(req.status) }}>{formatSupportStatus(req.status)}</span>
                      <span>{formatSupportCategory(req.category)}</span>
                      {priorityStyle && (
                        <span style={{ ...s.badge, ...priorityStyle }}>{formatSupportPriority(req.priority)}</span>
                      )}
                      <span>Updated {formatSupportDate(req.updated_at)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
