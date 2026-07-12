'use client'

import { useEffect, useState } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { formatIssueCategory, formatIssueStatus, ISSUE_STATUSES } from '@/lib/issue-reports'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import type { IssueReport, IssueStatus } from '@/types/database'

type IssueWithProfile = IssueReport & { profiles?: { name: string; email: string } }

export default function AdminIssuesPage() {
  const [issues, setIssues] = useState<IssueWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<IssueStatus | 'all'>('all')

  const load = async () => {
    const res = await fetch('/api/admin/issues')
    const data = await res.json()
    if (data.issues) setIssues(data.issues)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const updateStatus = async (id: string, status: IssueStatus) => {
    await fetch('/api/admin/issues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    void load()
  }

  const filtered = filter === 'all' ? issues : issues.filter((i) => i.status === filter)

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Issue Reports')}</h1>
        <p style={s.subtitle}>Client-submitted bug reports and technical issues.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setFilter('all')} style={filter === 'all' ? s.primaryBtn : s.secondaryBtn}>All</button>
        {ISSUE_STATUSES.map((st) => (
          <button key={st.value} type="button" onClick={() => setFilter(st.value)} style={filter === st.value ? s.primaryBtn : s.secondaryBtn}>
            {st.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading issues...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888' }}>No issue reports found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((issue) => (
            <div key={issue.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  <strong>{issue.profiles?.name ?? 'Unknown'}</strong>
                  <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>{issue.profiles?.email}</span>
                </div>
                <span style={{ fontSize: 13, textTransform: 'capitalize', fontWeight: 600 }}>{formatIssueStatus(issue.status)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                {formatIssueCategory(issue.category)} · {new Date(issue.created_at).toLocaleString()}
              </div>
              <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{issue.description}</p>
              {issue.screenshot_url && (
                <img src={issue.screenshot_url} alt="Screenshot" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 12 }} />
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ISSUE_STATUSES.filter((st) => st.value !== issue.status).map((st) => (
                  <button key={st.value} type="button" onClick={() => void updateStatus(issue.id, st.value)} style={s.linkBtn}>
                    Mark {st.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </AdminShell>
  )
}
