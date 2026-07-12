'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/admin/AdminShell'
import { PromptImportPanel } from '@/components/admin/PromptImportPanel'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatPromptCategory, listPromptLibrary } from '@/lib/admin/prompt-library'
import { formatDate } from '@/lib/coach-utils'
import { createClient } from '@/lib/supabase/client'
import type { PromptLibraryCategory, PromptLibraryListItem } from '@/types/database'

const supabase = createClient()

type StatusFilter = 'all' | 'draft' | 'published' | 'archived'
type SortKey = 'updated' | 'name' | 'category' | 'version'

function statusBadge(status: PromptLibraryListItem['list_status']) {
  if (status === 'published') return { ...s.badge, ...s.badgeOk }
  if (status === 'draft') return { ...s.badge, ...s.badgeWarn }
  return { ...s.badge, ...s.badgeMuted }
}

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptLibraryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | PromptLibraryCategory>('all')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      setError('')

      const result = await listPromptLibrary(supabase)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setPrompts(result.data)
      setLoading(false)
    }

    void load()
  }, [reloadKey])

  const filtered = useMemo(() => {
    let list = [...prompts]

    if (statusFilter !== 'all') {
      list = list.filter((p) => p.list_status === statusFilter)
    }
    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'category') return a.category.localeCompare(b.category)
      if (sortKey === 'version') return (b.current_version ?? 0) - (a.current_version ?? 0)
      const aTime = new Date(a.last_version_updated ?? a.updated_at).getTime()
      const bTime = new Date(b.last_version_updated ?? b.updated_at).getTime()
      return bTime - aTime
    })

    return list
  }, [prompts, search, statusFilter, categoryFilter, sortKey])

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading prompt library…</div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.containerWide}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={s.title}>{brandTitle('Prompt Library')}</h1>
              <p style={s.subtitle}>
                Source of truth for AI prompts · published prompts feed live generation
              </p>
            </div>
            <Link href="/admin/prompts/new" style={s.primaryBtn}>
              New prompt
            </Link>
          </div>

          {error && <div style={s.error}>{error}</div>}

          <PromptImportPanel
            endpoint="/api/admin/prompts/import"
            onImported={() => setReloadKey((value) => value + 1)}
          />

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search prompts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.searchInput}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={s.select}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | PromptLibraryCategory)}
              style={s.select}
            >
              <option value="all">All categories</option>
              <option value="system_prompt">System Prompt</option>
              <option value="initial_diet">Initial Diet</option>
              <option value="initial_workout">Initial Workout — Gym</option>
              <option value="initial_workout_home">Initial Workout — Home</option>
              <option value="weekly_diet_update">Weekly Diet Update</option>
              <option value="weekly_workout_update">Weekly Workout Update — Gym</option>
              <option value="weekly_workout_update_home">Weekly Workout Update — Home</option>
              <option value="mid_week_analysis">Mid-week Analysis</option>
              <option value="coach_message">Coach Message</option>
              <option value="future_prompts">Future Prompts</option>
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={s.select}>
              <option value="updated">Sort: Last updated</option>
              <option value="name">Sort: Name</option>
              <option value="category">Sort: Category</option>
              <option value="version">Sort: Version</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={s.empty}>
              No prompts found. <Link href="/admin/prompts/new">Create the first prompt</Link>.
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Prompt Name</th>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Current Version</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Last Updated</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((prompt) => (
                    <tr key={prompt.id}>
                      <td style={s.td}>
                        <strong>{prompt.name}</strong>
                        <div style={{ fontSize: 12, color: '#888' }}>{prompt.slug}</div>
                      </td>
                      <td style={s.td}>{formatPromptCategory(prompt.category)}</td>
                      <td style={s.td}>v{prompt.current_version ?? '—'}</td>
                      <td style={s.td}>
                        <span style={statusBadge(prompt.list_status)}>
                          {prompt.list_status}
                          {prompt.draft_version && prompt.published_version ? ' (draft pending)' : ''}
                        </span>
                      </td>
                      <td style={s.td}>
                        {formatDate(prompt.last_version_updated ?? prompt.updated_at)}
                      </td>
                      <td style={s.td}>
                        <Link href={`/admin/prompts/${prompt.id}`} style={s.linkBtn}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
