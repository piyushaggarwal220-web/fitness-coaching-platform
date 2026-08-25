'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { colors } from '@/lib/coach-theme'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'

const supabase = createClient()

export default function CoachProfilePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach) return
      const res = await fetch('/api/coach/profile')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load profile.')
        setLoading(false)
        return
      }
      setName(data.coach.name ?? '')
      setBio(data.coach.bio ?? '')
      setPhotoUrl(data.coach.photoUrl ?? null)
      setPhotoPath(data.coach.displayPhotoPath ?? null)
      setLoading(false)
    }
    void load()
  }, [router])

  const uploadPhoto = async (file: File) => {
    const coach = await requireCoach(supabase, router)
    if (!coach) return
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${coach.user_id}/coach_display.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) throw new Error(uploadError.message)
    setPhotoPath(path)
    const patch = await fetch('/api/coach/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayPhotoPath: path }),
    })
    const data = await patch.json()
    if (!patch.ok) throw new Error(data.error ?? 'Could not save photo')
    setPhotoUrl(data.coach.photoUrl)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOk('')
    try {
      const res = await fetch('/api/coach/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio, displayPhotoPath: photoPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setOk('Profile saved. Clients will see this on their dashboard.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <CoachShell narrow loading><span /></CoachShell>

  return (
    <CoachShell narrow>
      <h1 style={s.title}>{brandTitle('Your profile')}</h1>
      <p style={s.subtitle}>Clients see your name, photo, and about text after you are assigned.</p>
      {error && <div style={s.error}>{error}</div>}
      {ok && <div style={{ ...s.card, color: colors.textPrimary }}>{ok}</div>}
      <form onSubmit={(ev) => void save(ev)} style={s.card}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              overflow: 'hidden',
              background: colors.bgElevated,
              flexShrink: 0,
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : null}
          </div>
          <label style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', color: colors.accent }}>
            {photoUrl ? 'Change photo' : 'Upload display photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(ev) => {
                const file = ev.target.files?.[0]
                if (!file) return
                void uploadPhoto(file).catch((err) => setError(err instanceof Error ? err.message : 'Upload failed'))
              }}
            />
          </label>
        </div>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Name</label>
        <input
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          required
          style={{ width: '100%', padding: 12, marginBottom: 14, borderRadius: 10, border: `1px solid ${colors.borderSubtle}` }}
        />
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>About you</label>
        <textarea
          value={bio}
          onChange={(ev) => setBio(ev.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="How you coach, who you help, what clients can expect."
          style={{ width: '100%', padding: 12, marginBottom: 16, borderRadius: 10, border: `1px solid ${colors.borderSubtle}`, resize: 'vertical' }}
        />
        <button type="submit" disabled={saving} style={{ ...s.actionCardPrimary, width: '100%', cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </CoachShell>
  )
}
