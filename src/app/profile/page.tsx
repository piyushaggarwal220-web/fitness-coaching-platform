'use client'

import { useEffect, useRef, useState } from 'react'
import { type User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Camera, LogOut } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { HeightInput } from '@/components/ui/HeightInput'
import { StorageImage } from '@/components/ui/StorageImage'
import { authenticateClient } from '@/lib/onboarding'
import { ALL_PLAN_GOAL_OPTIONS as FITNESS_GOAL_OPTIONS } from '@/lib/plan-goals'
import { InstallAppCard } from '@/components/pwa/InstallAppCard'
import { requestComplexityRecalculation } from '@/lib/complexity/client'
import { parseHeightCm, validateHeightCm } from '@/lib/height'
import {
  evaluateComplexityInputs,
  parseReviewReasons,
} from '@/lib/complexity/input-guards'
import { createClient } from '@/lib/supabase/client'
import { mobileStyles } from '@/lib/mobile-styles'
import { colors, spacing } from '@/lib/design-tokens'
import type { ProfileForm } from '@/types/database'

const supabase = createClient()
const PROFILE_EDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function daysUntilUnlock(editedAt: string | null | undefined): number {
  if (!editedAt) return 0
  const unlockAt = new Date(editedAt).getTime() + PROFILE_EDIT_COOLDOWN_MS
  const remaining = unlockAt - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / (24 * 60 * 60 * 1000))
}

export default function Profile() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    age: '',
    fitness_goal: '',
    weight: '',
    height: '',
    phone: '',
  })
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [settingsEditedAt, setSettingsEditedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [reviewReasons, setReviewReasons] = useState<string[]>([])
  const [confirmMetrics, setConfirmMetrics] = useState(false)
  const [previousDisplayScore, setPreviousDisplayScore] = useState<number | null>(null)

  const lockDays = daysUntilUnlock(settingsEditedAt)
  const settingsLocked = lockDays > 0

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, {
        requireOnboarding: true,
        requirePayment: true,
      })
      if (!result) {
        setLoading(false)
        return
      }

      setUser(result.user as User)
      if (result.profile) {
        setProfile({
          name: result.profile.name || '',
          age: result.profile.age != null ? String(result.profile.age) : '',
          fitness_goal: result.profile.fitness_goal || '',
          weight: result.profile.weight != null ? String(result.profile.weight) : '',
          height: result.profile.height != null ? String(result.profile.height) : '',
          phone: result.profile.phone || '',
        })
        setAvatarPath(result.profile.avatar_path ?? null)
        setSettingsEditedAt(result.profile.profile_settings_edited_at ?? null)
        setNeedsReview(Boolean(result.profile.complexity_input_needs_review))
        setReviewReasons(parseReviewReasons(result.profile.complexity_input_review_reasons))
        setPreviousDisplayScore(
          typeof result.profile.complexity_score === 'number' ? result.profile.complexity_score : null
        )
      }
      setLoading(false)
    }
    void checkUser()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (settingsLocked) return
    setProfile({ ...profile, [e.target.name]: e.target.value })
    setConfirmMetrics(false)
  }

  const handleAvatar = async (file: File | null) => {
    if (!user || !file) return
    setUploadingAvatar(true)
    setMessage('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user.id}/avatar_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })
      if (uploadError) throw uploadError
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      setAvatarPath(path)
      setMessage('Profile photo updated.')
    } catch (err) {
      setMessage(err instanceof Error ? `Error uploading photo: ${err.message}` : 'Photo upload failed')
    }
    setUploadingAvatar(false)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return

    if (settingsLocked) {
      setMessage(
        `Profile settings can only be changed once per week. Try again in ${lockDays} day${lockDays === 1 ? '' : 's'}.`
      )
      return
    }

    setSaving(true)
    setMessage('')

    const age = profile.age ? parseInt(profile.age, 10) : null
    const weight = profile.weight ? parseFloat(profile.weight) : null
    const heightError = validateHeightCm(profile.height)
    if (heightError) {
      setMessage(`Error saving profile: ${heightError}`)
      setSaving(false)
      return
    }
    const height = parseHeightCm(profile.height)

    const guard = evaluateComplexityInputs(
      { age, height, weight },
      { previousDisplayScore }
    )

    if (guard.needsReview && !confirmMetrics) {
      setNeedsReview(true)
      setReviewReasons(guard.reasons)
    }

    const stillNeedsReview = guard.needsReview && !confirmMetrics
    const now = new Date().toISOString()
    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        name: profile.name.trim(),
        age,
        fitness_goal: profile.fitness_goal || null,
        weight,
        height,
        phone: profile.phone.trim() || null,
        complexity_input_needs_review: stillNeedsReview,
        complexity_input_review_reasons: stillNeedsReview ? guard.reasons : [],
        profile_settings_edited_at: now,
        updated_at: now,
      },
      { onConflict: 'id', ignoreDuplicates: false, defaultToNull: false }
    )

    if (error) {
      setMessage('Error saving profile: ' + error.message)
    } else {
      setSettingsEditedAt(now)
      setNeedsReview(stillNeedsReview)
      setReviewReasons(stillNeedsReview ? guard.reasons : [])
      setConfirmMetrics(false)
      if (!stillNeedsReview) {
        await requestComplexityRecalculation({ trigger: 'profile_edit_client' })
      }
      setMessage(
        stillNeedsReview
          ? 'Saved. Please confirm these details are correct — plan preparation stays paused until then. Next edit unlocks in 7 days.'
          : 'Profile saved. You can edit settings again in 7 days.'
      )
    }
    setSaving(false)
  }

  const handleLogout = async () => {
    const { invalidateSessionCache } = await import('@/lib/session-restore')
    invalidateSessionCache()
    await supabase.auth.signOut()
    router.push('/')
  }

  const isError = message.toLowerCase().includes('error') || message.toLowerCase().includes('re-check') || message.toLowerCase().includes('once per week')

  if (loading) return <ClientShell title="Profile" loading />

  return (
    <ClientShell title="Profile">
      <div style={{ marginBottom: spacing[5] }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploadingAvatar}
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            backgroundColor: colors.accentMuted,
            border: `2px solid ${colors.accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 800,
            color: colors.accent,
            marginBottom: spacing[3],
            padding: 0,
            overflow: 'hidden',
            cursor: 'pointer',
            position: 'relative',
          }}
          aria-label="Upload profile photo"
        >
          {avatarPath ? (
            <StorageImage
              bucket="avatars"
              src={avatarPath}
              alt="Profile"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            (profile.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()
          )}
          <span
            style={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: colors.accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={14} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void handleAvatar(e.target.files?.[0] ?? null)}
        />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {profile.name || 'Your Profile'}
        </h1>
        <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 15 }}>{user?.email}</p>
        <p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: 13 }}>
          {uploadingAvatar
            ? 'Uploading photo…'
            : 'Tap your photo to update it anytime. Profile settings can change once per week.'}
        </p>
      </div>

      <InstallAppCard />

      {settingsLocked && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[3] }}>
          Profile settings are locked for {lockDays} more day{lockDays === 1 ? '' : 's'}. You can still update your
          profile photo.
        </div>
      )}

      {needsReview && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[3] }}>
          <strong>Please re-check your details</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {(reviewReasons.length > 0 ? reviewReasons : ['Some metrics look incorrect.']).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {message && <div style={isError ? mobileStyles.error : mobileStyles.success}>{message}</div>}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Card variant="elevated">
          <fieldset disabled={settingsLocked} style={{ border: 'none', margin: 0, padding: 0 }}>
            <Input
              label="Full Name"
              type="text"
              name="name"
              value={profile.name}
              onChange={handleChange}
              placeholder="Enter your name"
            />
            <Input
              label="Phone"
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              placeholder="+91 98765 43210"
            />
            <Input
              label="Age"
              type="number"
              name="age"
              value={profile.age}
              onChange={handleChange}
              placeholder="Enter your age"
            />

            <div style={{ marginBottom: spacing[3] }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: spacing[1],
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.textSecondary,
                }}
              >
                Fitness Goal
              </label>
              <select
                name="fitness_goal"
                value={profile.fitness_goal}
                onChange={handleChange}
                style={{
                  width: '100%',
                  minHeight: 56,
                  padding: '12px 16px',
                  border: `1px solid ${colors.borderSubtle}`,
                  borderRadius: 12,
                  fontSize: 16,
                  backgroundColor: colors.bgElevated,
                  color: colors.textPrimary,
                }}
              >
                <option value="">Select your goal</option>
                {FITNESS_GOAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: spacing[3] }}>
              <Input
                label="Weight (kg)"
                type="number"
                name="weight"
                value={profile.weight}
                onChange={handleChange}
                placeholder="70"
              />
              <HeightInput
                value={profile.height}
                onChange={(height) => {
                  if (settingsLocked) return
                  setProfile((current) => ({ ...current, height }))
                  setConfirmMetrics(false)
                }}
                required
              />
            </div>

            {(needsReview || reviewReasons.length > 0) && (
              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginBottom: spacing[3],
                  fontSize: 14,
                  color: colors.textPrimary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmMetrics}
                  onChange={(e) => setConfirmMetrics(e.target.checked)}
                  style={{ marginTop: 3, width: 18, height: 18 }}
                />
                <span>I confirm these height, weight, and age values are correct.</span>
              </label>
            )}
          </fieldset>

          <Button type="submit" loading={saving} fullWidth disabled={settingsLocked}>
            {settingsLocked ? `Locked · ${lockDays}d left` : 'Save Profile'}
          </Button>
        </Card>
      </form>

      <div style={{ marginTop: spacing[4] }}>
        <Button variant="ghost" fullWidth onClick={() => void handleLogout()} style={{ color: colors.danger }}>
          <LogOut size={18} /> Sign Out
        </Button>
      </div>
    </ClientShell>
  )
}
