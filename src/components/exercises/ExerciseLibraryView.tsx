'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dumbbell, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { readApiJson } from '@/lib/api-response'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'

type LibraryExercise = {
  id: string
  title: string
  slug: string
  muscleGroup?: string | null
  equipment?: string | null
  difficulty?: string | null
  thumbnailUrl?: string | null
  hasVideo?: boolean
  description?: string | null
  videoUrl?: string | null
  instructions?: string[] | null
}

const MUSCLE_FILTERS = [
  '',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
]

export function ExerciseLibraryView() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [exercises, setExercises] = useState<LibraryExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<LibraryExercise | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (muscleGroup) params.set('muscleGroup', muscleGroup)
      params.set('pageSize', '24')
      const res = await fetch(`/api/exercises?${params.toString()}`, { credentials: 'include' })
      const parsed = await readApiJson<{ exercises?: LibraryExercise[]; error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      setExercises(parsed.data.exercises ?? [])
    } catch (err) {
      setExercises([])
      setError(err instanceof Error ? err.message : 'Failed to load exercises')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, muscleGroup])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openDetail = async (ex: LibraryExercise) => {
    setSelected(ex)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/exercises/${encodeURIComponent(ex.id)}`, { credentials: 'include' })
      const parsed = await readApiJson<{ exercise?: LibraryExercise; error?: string }>(res)
      if (parsed.ok && parsed.data.exercise) {
        setSelected(parsed.data.exercise)
      }
    } catch {
      // Keep list card data if detail fetch fails
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div>
      <p style={{ margin: `0 0 ${spacing[4]}px`, color: colors.textSecondary, fontSize: 15, lineHeight: 1.45 }}>
        Search the form library and watch HD demos for every movement in your plan.
      </p>

      <div style={{ position: 'relative', marginBottom: spacing[3] }}>
        <Search
          size={18}
          color={colors.textMuted}
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          style={{ ...trackerInputStyle, paddingLeft: 42 }}
          aria-label="Search exercises"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: spacing[3] }}>
        {MUSCLE_FILTERS.map((m) => {
          const active = muscleGroup === m
          const label = m ? m.replace(/_/g, ' ') : 'All'
          return (
            <button
              key={m || 'all'}
              type="button"
              onClick={() => setMuscleGroup(m)}
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 999,
                border: `1px solid ${active ? colors.accent : colors.borderSubtle}`,
                background: active ? colors.accentMuted : colors.bgElevated,
                color: active ? colors.accent : colors.textSecondary,
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {error && (
        <Card variant="glass" style={{ marginBottom: spacing[3] }}>
          <p style={{ margin: 0, color: colors.danger, fontSize: 14 }}>{error}</p>
        </Card>
      )}

      {loading ? (
        <p style={{ color: colors.textMuted }}>Loading library…</p>
      ) : exercises.length === 0 ? (
        <p style={{ color: colors.textMuted }}>No exercises found. Try another search.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {exercises.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => void openDetail(ex)}
              style={{
                textAlign: 'left',
                padding: 0,
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.md,
                background: colors.bgCard,
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  aspectRatio: '16 / 10',
                  background: colors.bgElevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {ex.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Dumbbell size={28} color={colors.textMuted} />
                )}
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: colors.textPrimary }}>
                  {ex.title}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: colors.textMuted, textTransform: 'capitalize' }}>
                  {[ex.muscleGroup, ex.equipment].filter(Boolean).join(' · ') || 'Exercise'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: spacing[3],
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: colors.bgCard,
              borderRadius: radius.lg,
              border: `1px solid ${colors.borderSubtle}`,
              padding: spacing[4],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{selected.title}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, textTransform: 'capitalize' }}>
                  {[selected.muscleGroup, selected.equipment, selected.difficulty].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: `1px solid ${colors.borderSubtle}`,
                  background: colors.bgElevated,
                  color: colors.textSecondary,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            {detailLoading && <p style={{ color: colors.textMuted }}>Loading video…</p>}

            {selected.videoUrl && (
              <video
                key={selected.videoUrl}
                src={selected.videoUrl}
                poster={selected.thumbnailUrl ?? undefined}
                controls
                playsInline
                style={{ width: '100%', borderRadius: 12, background: '#000', marginBottom: 16 }}
              />
            )}

            {selected.description && (
              <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
                {selected.description}
              </p>
            )}

            {selected.instructions && selected.instructions.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8 }}>STEPS</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                  {selected.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
