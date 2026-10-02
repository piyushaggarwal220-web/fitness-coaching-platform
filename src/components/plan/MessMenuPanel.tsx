'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { clientColors as colors, radius, spacing } from '@/lib/design-tokens'

type MessMenu = {
  weekStart: string | null
  text: string
  photoPath: string | null
  updatedAt: string | null
}

export function MessMenuPanel() {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [saved, setSaved] = useState<MessMenu | null>(null)
  const [weekStart, setWeekStart] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/client/mess-menu', { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!active) return
        if (res.ok) {
          setSaved(data?.messMenu ?? null)
          setText(data?.messMenu?.text ?? '')
          setWeekStart(data?.weekStart ?? '')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setOk('')
    try {
      let photoPath = saved?.photoPath ?? null
      if (photo) {
        const form = new FormData()
        form.set('file', photo)
        form.set('label', 'mess_menu')
        const upload = await fetch('/api/checkin/upload-photo', {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        const uploaded = await upload.json().catch(() => null)
        if (!upload.ok) {
          setError(uploaded?.error ?? 'Photo upload failed')
          setSaving(false)
          return
        }
        photoPath = uploaded.path ?? null
      }
      const res = await fetch('/api/client/mess-menu', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, photoPath }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not save the menu')
        setSaving(false)
        return
      }
      setSaved(data.messMenu)
      setPhoto(null)
      setOk('Saved for this week. Your next plan uses this menu.')
    } catch {
      setError('Could not save the menu')
    } finally {
      setSaving(false)
    }
  }

  const stale = saved?.weekStart && weekStart && saved.weekStart !== weekStart

  return (
    <section
      style={{
        marginTop: spacing[4],
        padding: spacing[4],
        borderRadius: 16,
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgCard,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18, color: colors.textPrimary }}>PG or hostel menu</h2>
      <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
        Fixed mess food? Write this week’s breakfast, lunch, and dinner, or upload a photo of the menu.
        The next diet is built from what you send, not a home-cooked chart.
      </p>
      {loading ? (
        <p style={{ color: colors.textMuted, fontSize: 14 }}>Loading menu…</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} style={{ marginTop: spacing[3], display: 'grid', gap: 10 }}>
          {stale && (
            <p style={{ margin: 0, color: colors.warning, fontSize: 13 }}>
              Last menu was for the week of {saved?.weekStart}. Send a new one for this week.
            </p>
          )}
          <label style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }} htmlFor="mess-menu-text">
            Write the menu
          </label>
          <textarea
            id="mess-menu-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'Mon breakfast: poha\nMon lunch: rice, dal, aloo\nMon dinner: roti, paneer'}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: radius.sm,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgElevated,
              color: colors.textPrimary,
              padding: 12,
              fontSize: 15,
              lineHeight: 1.45,
            }}
          />
          <label style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
            Or upload the mess menu photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              style={{ display: 'block', marginTop: 6, color: colors.textSecondary }}
            />
          </label>
          {saved?.photoPath && !photo && (
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>A menu photo is already saved.</p>
          )}
          {error && <p style={{ margin: 0, color: colors.danger, fontSize: 13 }}>{error}</p>}
          {ok && <p style={{ margin: 0, color: colors.success, fontSize: 13 }}>{ok}</p>}
          <button
            type="submit"
            disabled={saving || (!text.trim() && !photo && !saved?.photoPath)}
            style={{
              minHeight: 44,
              border: 'none',
              borderRadius: radius.sm,
              background: colors.accent,
              color: colors.textInverse,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save this week’s menu'}
          </button>
        </form>
      )}
    </section>
  )
}
