'use client'

import { useEffect, useState } from 'react'
import { type User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { HeightInput } from '@/components/ui/HeightInput'
import { ProfilePlayerHero } from '@/components/profile/ProfilePlayerHero'
import { ProfilePhotoWall } from '@/components/profile/ProfilePhotoWall'
import { ProfileQuickActions } from '@/components/profile/ProfileQuickActions'
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
import {
  LEAGUE_TIER_LABELS,
  normalizeLeagueTier,
  pointsToNextTier,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'
import { nextEligibleLeagueDivision } from '@/lib/league/eligibility'
import type { ProfileForm } from '@/types/database'
import styles from './profile.module.css'

const supabase = createClient()
const PROFILE_EDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

type LeaguePayload = {
  optIn: boolean
  me: LeagueStandingRow | null
  standings: LeagueStandingRow[]
  crazyEligible?: boolean
}

function daysUntilUnlock(editedAt: string | null | undefined): number {
  if (!editedAt) return 0
  const unlockAt = new Date(editedAt).getTime() + PROFILE_EDIT_COOLDOWN_MS
  const remaining = unlockAt - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / (24 * 60 * 60 * 1000))
}

function parseGalleryPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function leagueHeroStats(data: LeaguePayload | null) {
  if (!data?.me) {
    return { rankProgress: 12, pointsLabel: 'Join the league to start earning points' }
  }

  const tier = normalizeLeagueTier(data.me.tier ?? 'bronze') as LeagueTier
  const crazyEligible = data.crazyEligible ?? false
  const { next: nextDivision, blockedByCrazyGate } = nextEligibleLeagueDivision(tier, crazyEligible)
  const pointsNeeded = data.optIn ? pointsToNextTier(tier, data.me.points, data.standings) : null
  const currentTierFloor =
    data.standings.reduce((floor, row) => Math.min(floor, row.points), data.me.points) ?? 0
  const nextFloor = pointsNeeded != null ? data.me.points + pointsNeeded : null
  const rankProgress =
    nextFloor != null && nextFloor > currentTierFloor
      ? Math.max(4, Math.min(100, ((data.me.points - currentTierFloor) / (nextFloor - currentTierFloor)) * 100))
      : data.me.promotionZone
        ? 100
        : 12

  let pointsLabel = `${LEAGUE_TIER_LABELS[tier]} · keep logging to climb`
  if (blockedByCrazyGate) {
    pointsLabel = 'Crazy League locked · 12-month plan required'
  } else if (nextDivision && pointsNeeded != null) {
    pointsLabel = `${pointsNeeded} pts to top 10% → ${LEAGUE_TIER_LABELS[nextDivision]}`
  } else if (nextDivision) {
    pointsLabel = `Top 10% advance to ${LEAGUE_TIER_LABELS[nextDivision]}`
  }

  return { rankProgress, pointsLabel }
}

export default function Profile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    age: '',
    fitness_goal: '',
    weight: '',
    height: '',
    phone: '',
    goal_details: '',
  })
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [galleryPaths, setGalleryPaths] = useState<string[]>([])
  const [leagueData, setLeagueData] = useState<LeaguePayload | null>(null)
  const [settingsEditedAt, setSettingsEditedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [reviewReasons, setReviewReasons] = useState<string[]>([])
  const [confirmMetrics, setConfirmMetrics] = useState(false)
  const [previousDisplayScore, setPreviousDisplayScore] = useState<number | null>(null)
  const [savingGoals, setSavingGoals] = useState(false)
  const [goalMessage, setGoalMessage] = useState('')

  const lockDays = daysUntilUnlock(settingsEditedAt)
  const settingsLocked = lockDays > 0
  const { rankProgress, pointsLabel } = leagueHeroStats(leagueData)

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
          goal_details: result.profile.client_goal_details?.trim() || '',
        })
        setAvatarPath(result.profile.avatar_path ?? null)
        setGalleryPaths(parseGalleryPaths(result.profile.profile_gallery_paths))
        setSettingsEditedAt(result.profile.profile_settings_edited_at ?? null)
        setNeedsReview(Boolean(result.profile.complexity_input_needs_review))
        setReviewReasons(parseReviewReasons(result.profile.complexity_input_review_reasons))
        setPreviousDisplayScore(
          typeof result.profile.complexity_score === 'number' ? result.profile.complexity_score : null
        )
      }

      try {
        const response = await fetch('/api/league', { credentials: 'include' })
        const json = await response.json()
        if (response.ok) setLeagueData(json as LeaguePayload)
      } catch {
        // League stats are optional on profile.
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

  const handleSaveGoalDetails = async () => {
    if (!user) return
    setSavingGoals(true)
    setGoalMessage('')
    const details = profile.goal_details.trim()
    if (details.length > 0 && details.length < 15) {
      setGoalMessage('Please add a bit more detail (at least 15 characters) or clear the field.')
      setSavingGoals(false)
      return
    }

    const { data: row } = await supabase
      .from('profiles')
      .select('onboarding_data')
      .eq('id', user.id)
      .maybeSingle()

    const onboardingData = (row?.onboarding_data ?? { version: 1 }) as Record<string, unknown>
    const goals = (onboardingData.goals ?? {}) as Record<string, unknown>

    const { error } = await supabase
      .from('profiles')
      .update({
        client_goal_details: details || null,
        onboarding_data: {
          ...onboardingData,
          goals: { ...goals, goalDetails: details || null },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setGoalMessage('Could not save: ' + error.message)
    } else {
      setGoalMessage('Goal description saved. Your coach and next plan update will use this.')
    }
    setSavingGoals(false)
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

  const isError =
    message.toLowerCase().includes('error') ||
    message.toLowerCase().includes('re-check') ||
    message.toLowerCase().includes('once per week')

  if (loading) return <ClientShell title="Player Profile" loading />

  return (
    <ClientShell title="Player Profile">
      <div className={styles.page}>
        <ProfilePlayerHero
          name={profile.name}
          email={user?.email ?? ''}
          avatarPath={avatarPath}
          uploadingAvatar={uploadingAvatar}
          onAvatarPick={(file) => void handleAvatar(file)}
          leagueMe={leagueData?.me ?? null}
          leagueOptIn={leagueData?.optIn ?? false}
          rankProgress={rankProgress}
          pointsLabel={pointsLabel}
        />

        <ProfileQuickActions />

        {user ? (
          <ProfilePhotoWall userId={user.id} paths={galleryPaths} onChange={setGalleryPaths} />
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your goals in detail</h2>
          <p className={styles.sectionHint}>
            Tell us what you want in your own words — timeline, events, fat loss then reverse, muscle gain, etc.
            AI uses this to shape your journey plan. Update anytime (not subject to the weekly profile lock).
          </p>
          <textarea
            className={styles.goalArea}
            value={profile.goal_details}
            onChange={(e) => {
              setProfile({ ...profile, goal_details: e.target.value })
              setGoalMessage('')
            }}
            rows={5}
            placeholder="e.g. Cut for my wedding in 10 weeks, then reverse slowly. I rebound easily — need structure."
          />
          {goalMessage ? (
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 13,
                color: goalMessage.startsWith('Could') ? colors.danger : colors.success,
              }}
            >
              {goalMessage}
            </p>
          ) : null}
          <div style={{ marginTop: spacing[3] }}>
            <Button type="button" loading={savingGoals} onClick={() => void handleSaveGoalDetails()}>
              Save goal description
            </Button>
          </div>
        </section>

        <InstallAppCard />

        {settingsLocked && (
          <div style={{ ...mobileStyles.error }}>
            Profile settings are locked for {lockDays} more day{lockDays === 1 ? '' : 's'}. You can still update
            photos and goal description.
          </div>
        )}

        {needsReview && (
          <div style={{ ...mobileStyles.error }}>
            <strong>Please re-check your details</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {(reviewReasons.length > 0 ? reviewReasons : ['Some metrics look incorrect.']).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {message ? <div style={isError ? mobileStyles.error : mobileStyles.success}>{message}</div> : null}

        <details className={styles.collapse}>
          <summary className={styles.collapseSummary}>
            Account & body stats
            <ChevronDown size={18} color={colors.textMuted} aria-hidden />
          </summary>
          <div className={styles.collapseBody}>
            <form onSubmit={(e) => void handleSubmit(e)}>
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
            </form>
          </div>
        </details>

        <Button variant="ghost" fullWidth onClick={() => void handleLogout()} style={{ color: colors.danger }}>
          <LogOut size={18} /> Sign Out
        </Button>
      </div>
    </ClientShell>
  )
}
