'use client'

import { useEffect, useState } from 'react'
import { type User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Calendar,
  ClipboardList,
  ListChecks,
  MessageCircle,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  getClientCheckinSchedule,
  hasCoachingDayStarted,
} from '@/lib/checkin-schedule'
import { shouldBypassCheckinScheduleClient } from '@/lib/config'
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge'
import { clientFacingPlanTitle } from '@/lib/plan-metadata'
import { authenticateClient } from '@/lib/onboarding'
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore'
import { PlanCountdownCard } from '@/components/dashboard/PlanCountdown'
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard'
import { CheckinDueBanner } from '@/components/dashboard/CheckinDueBanner'
import { GettingStartedGuide } from '@/components/dashboard/GettingStartedGuide'
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { getClientDashboardStatus, hasOpenedDietAndWorkout } from '@/lib/purchase-dashboard'
import { getActiveSubscription } from '@/lib/subscription'
import { loadTodayTrackerView } from '@/lib/daily-tracker'
import { isItemComplete } from '@/lib/daily-tracker/scores'
import type { DailyTrackerDay, TrackerSnapshotItem } from '@/lib/daily-tracker/types'
import {
  clientCheckinShortHint,
  clientCheckinStatusLabel,
  clientCheckinTypeLabel,
  timeOfDayGreeting,
} from '@/lib/client-ux-copy'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, typography } from '@/lib/design-tokens'
import { mobileStyles } from '@/lib/mobile-styles'
import { motionClass, staggerClass } from '@/lib/motion'
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase } from '@/types/database'
import type { InitialPlanGenerationJob } from '@/lib/initial-plan-generation'

const supabase = createClient()

type DashboardCheckin = Pick<
  Checkin,
  'id' | 'client_id' | 'checkin_type' | 'submitted_at' | 'coaching_week' | 'coaching_day' | 'reviewed'
>

type PrimaryAction = {
  title: string
  detail: string
  href: string
  cta: string
  badge?: string | null
  tone: 'accent' | 'warning' | 'success' | 'muted'
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [allCheckins, setAllCheckins] = useState<DashboardCheckin[]>([])
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [coach, setCoach] = useState<Coach | null>(null)
  const [todayTrackerPercent, setTodayTrackerPercent] = useState<number | null>(null)
  const [trackerSubtitle, setTrackerSubtitle] = useState('Meals, workout, water & more')
  const [hasLoggedToday, setHasLoggedToday] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [restoringSession, setRestoringSession] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [scheduleNow, setScheduleNow] = useState(() => new Date())
  const [generationJob, setGenerationJob] = useState<InitialPlanGenerationJob | null>(null)

  useEffect(() => {
    if (!profile?.checkin_schedule_started_at) return
    const timer = window.setInterval(() => setScheduleNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [profile?.checkin_schedule_started_at])

  useEffect(() => {
    const checkUser = async () => {
      try {
        const result = await authenticateClient(supabase, router, {
          requireOnboarding: true,
          requirePayment: true,
        })
        setRestoringSession(false)
        if (!result) {
          setLoading(false)
          return
        }

        const profileData = result.profile

        if (result.profileError && !profileData) {
          setLoadError('Could not load your profile. Please refresh the page.')
          setLoading(false)
          return
        }

        if (!profileData) {
          setLoadError('Your profile could not be loaded. Please refresh or log in again.')
          setLoading(false)
          return
        }

        setUser(result.user as User)
        setProfile(profileData)

        const userId = result.user.id
        const coachId = profileData.coach_id

        const [
          checkinResult,
          planResult,
          purchaseResult,
          coachResult,
          convResult,
          generationResult,
        ] = await Promise.all([
          supabase
            .from('checkins')
            .select('id, client_id, checkin_type, submitted_at, coaching_week, coaching_day, reviewed')
            .eq('client_id', userId)
            .order('submitted_at', { ascending: false })
            .limit(24),
          supabase
            .from('plans')
            .select('id, client_id, coach_id, title, phase, version, active, delivered_at, updated_at, created_at, diet_opened_at, workout_opened_at')
            .eq('client_id', userId)
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('purchases')
            .select('id, user_id, status, amount_paise, currency, created_at, plan_name, plan_slug')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          coachId
            ? supabase.from('coaches').select('id, name, user_id, hard_cap').eq('id', coachId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          coachId
            ? supabase.from('coach_conversations').select('unread_by_client').eq('client_id', userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('initial_plan_generation_jobs')
            .select('id, client_id, status, error_message, updated_at')
            .eq('client_id', userId)
            .maybeSingle(),
        ])

        if (checkinResult.error) throw new Error(checkinResult.error.message)
        if (planResult.error) throw new Error(planResult.error.message)
        if (purchaseResult.error) throw new Error(purchaseResult.error.message)
        if (coachResult.error) throw new Error(coachResult.error.message)
        if (convResult.error) throw new Error(convResult.error.message)
        if (generationResult.error) throw new Error(generationResult.error.message)

        const checkinList = (checkinResult.data ?? []) as DashboardCheckin[]
        setAllCheckins(checkinList)

        const planData = planResult.data as Plan | null
        setActivePlan(planData)
        setPurchase(purchaseResult.data as Purchase | null)

        if (coachResult.data) setCoach(coachResult.data as Coach)
        setUnreadMessages((convResult.data?.unread_by_client as number) ?? 0)
        setGenerationJob(generationResult.data as InitialPlanGenerationJob | null)
        setLoading(false)

        const job = generationResult.data as InitialPlanGenerationJob | null
        const needsEnsure =
          profileData.onboarding_complete &&
          !profileData.plan_delivered &&
          !planData &&
          (!job || job.status === 'queued' || job.status === 'failed')
        if (needsEnsure) {
          void fetch('/api/onboarding/ensure-generation', {
            method: 'POST',
            credentials: 'include',
          })
            .then(async (res) => {
              if (!res.ok) return
              const body = (await res.json().catch(() => null)) as { status?: string } | null
              if (!body?.status) return
              const { data: refreshed } = await supabase
                .from('initial_plan_generation_jobs')
                .select('id, client_id, status, error_message, updated_at')
                .eq('client_id', userId)
                .maybeSingle()
              if (refreshed) setGenerationJob(refreshed as InitialPlanGenerationJob)
            })
            .catch(() => {})
        }

        if (planData) {
          void loadTodayTrackerView(supabase, userId, profileData).then(({ view }) => {
            if (!view) return
            setTodayTrackerPercent(view.day.overall_percent ?? 0)
            setTrackerSubtitle(getTrackerHomeSummary(view.day))
            setHasLoggedToday((view.day.overall_percent ?? 0) > 0)
          })
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard')
        setLoading(false)
      }
    }
    checkUser()
  }, [router])

  const status = profile
    ? getClientDashboardStatus({ profile, purchase, coach, activePlan })
    : null

  const subscription = getActiveSubscription(
    purchase,
    profile?.subscription_expires_at ?? null
  )

  const checkinScheduleBypass = shouldBypassCheckinScheduleClient()
  const coachingDayStarted = profile?.checkin_schedule_started_at
    ? hasCoachingDayStarted(profile.checkin_schedule_started_at, scheduleNow)
    : false
  const coachingDayPending = Boolean(profile?.checkin_schedule_started_at) && !coachingDayStarted
  const checkinSchedule = profile?.checkin_schedule_started_at && coachingDayStarted
    ? getClientCheckinSchedule(profile.checkin_schedule_started_at, allCheckins, scheduleNow, {
        bypassSchedule: checkinScheduleBypass,
      })
    : null

  const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const openedPlan = hasOpenedDietAndWorkout(activePlan)
  const checkinDoneThisWeek = Boolean(
    checkinSchedule?.weekCheckins.some((task) => task.status === 'completed' || task.status === 'awaiting_review')
  )

  const primary = resolvePrimaryAction({
    status,
    activePlan,
    coachingDayPending,
    checkinAvailable: checkinSchedule?.nextCheckinStatus === 'available' ? checkinSchedule.nextCheckin : null,
    todayTrackerPercent,
    trackerSubtitle,
    generationJob,
    planDelivered: profile?.plan_delivered === true,
    coachName: coach?.name ?? null,
    unreadMessages,
  })

  const shortcuts = [
    {
      key: 'plan',
      title: 'My plan',
      subtitle: activePlan ? clientFacingPlanTitle(activePlan.title) : 'Diet & workout',
      href: '/plan',
      icon: ClipboardList,
    },
    {
      key: 'progress',
      title: 'Progress',
      subtitle: 'Photos & history',
      href: '/journey',
      icon: TrendingUp,
    },
    {
      key: 'coach',
      title: 'Coach',
      subtitle: unreadMessages > 0
        ? `${unreadMessages} new`
        : coach?.name
          ? coach.name.split(' ')[0]
          : 'Message',
      href: '/client/chat',
      icon: MessageCircle,
    },
  ]

  return (
    <ClientShell
      title="Today"
      loading={loading}
      loadingMessage={restoringSession ? SESSION_RESTORE_MESSAGE : undefined}
    >
      {loadError && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[4] }}>
          {loadError}
        </div>
      )}

      {checkinSchedule?.nextCheckinStatus === 'available' && checkinSchedule.nextCheckin && (
        <CheckinDueBanner checkin={checkinSchedule.nextCheckin} />
      )}

      <div style={{ marginBottom: spacing[5] }} className={motionClass.pageEnter}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: colors.accent,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {timeOfDayGreeting()}
        </p>
        <h1 style={{ ...typography.pageTitle, marginTop: 6 }}>{firstName}</h1>
        <p style={{ margin: '10px 0 0', fontSize: 16, color: colors.textSecondary, lineHeight: 1.45 }}>
          Here’s what to do next.
        </p>
      </div>

      {checkinScheduleBypass && (
        <DevelopmentModeBadge style={{ marginBottom: spacing[4] }} />
      )}

      {generationJob && !activePlan && profile?.plan_delivered !== true && (
        <Card
          variant="glass"
          className={motionClass.cardEnter}
          style={{
            marginBottom: spacing[4],
            border: generationJob.status === 'failed'
              ? `1px solid rgba(239,68,68,0.35)`
              : `1px solid rgba(249,115,22,0.25)`,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>
            {generationJob.status === 'queued' || generationJob.status === 'generating'
              ? 'Your plan is being prepared'
              : generationJob.status === 'ready'
                ? 'Your coach is reviewing your plan'
                : 'Your coach is finishing your plan'}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
            You’ll see it here as soon as it’s ready. No action needed right now.
          </p>
        </Card>
      )}

      <section style={{ marginBottom: spacing[5] }}>
        <PrimaryActionCard action={primary} onOpen={(href) => router.push(href)} />
      </section>

      <GettingStartedGuide
        hasPlan={Boolean(activePlan)}
        openedPlan={openedPlan}
        hasLoggedToday={hasLoggedToday}
        checkinDoneThisWeek={checkinDoneThisWeek}
      />

      {activePlan && !coachingDayPending && (
        <section style={{ marginBottom: spacing[5] }}>
          <SectionLabel title="Today’s checklist" subtitle={trackerSubtitle} />
          <Card
            variant="elevated"
            interactive
            className={staggerClass(0)}
            onClick={() => router.push('/tracker')}
            style={{ marginBottom: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: colors.accentMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ListChecks size={22} color={colors.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>Log today</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                  Meals · Workout · Water · Steps
                </p>
              </div>
              {todayTrackerPercent != null && (
                <span style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: colors.accent,
                  backgroundColor: colors.accentMuted,
                  padding: '8px 12px',
                  borderRadius: 999,
                }}>
                  {todayTrackerPercent}%
                </span>
              )}
              <ArrowRight size={18} color={colors.textMuted} />
            </div>
          </Card>
        </section>
      )}

      {activePlan && coachingDayPending && (
        <Card variant="glass" style={{ marginBottom: spacing[5] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: colors.accentMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Timer size={22} color={colors.accent} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Tracking starts tomorrow</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                Open your plan today so you’re ready for day one.
              </p>
            </div>
          </div>
        </Card>
      )}

      {checkinSchedule?.nextCheckin && checkinSchedule.nextCheckinStatus !== 'available' && (
        <section style={{ marginBottom: spacing[5] }}>
          <SectionLabel title="Upcoming check-in" subtitle="Your coach uses this to adjust your plan" />
          <Card variant="glass" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.warningMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Calendar size={20} color={colors.warning} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>
                  {clientCheckinTypeLabel(checkinSchedule.nextCheckin.type)}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary, lineHeight: 1.45 }}>
                  {clientCheckinShortHint(checkinSchedule.nextCheckin.type)}
                </p>
                <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.textMuted }}>
                  {checkinSchedule.nextCheckinStatus === 'missed'
                    ? 'This window closed — the next one will appear here.'
                    : `Opens in ${checkinSchedule.countdownDetailed ?? checkinSchedule.countdownLabel ?? 'a bit'}`}
                  {' · '}
                  {clientCheckinStatusLabel(checkinSchedule.nextCheckinStatus ?? 'upcoming')}
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section style={{ marginBottom: spacing[5] }}>
        <SectionLabel title="Quick links" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: spacing[2] }}>
          {shortcuts.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => router.push(item.href)}
                className={`btn-press ${staggerClass(index)}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: spacing[3],
                  borderRadius: 16,
                  border: `1px solid ${colors.borderSubtle}`,
                  background: colors.bgCard,
                  color: colors.textPrimary,
                  textAlign: 'left',
                  cursor: 'pointer',
                  minHeight: 112,
                }}
              >
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: colors.accentMuted,
                  color: colors.accent,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={18} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{item.title}</span>
                  <span style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 1.35,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 96,
                  }}>
                    {item.subtitle}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {(subscription || (profile && status?.paymentConfirmed)) && (
        <section style={{ marginBottom: spacing[5] }}>
          <SectionLabel title="Membership" subtitle="Optional details — you can ignore this while training" />
          {subscription && <ActiveSubscriptionCard subscription={subscription} />}
          {profile && status?.paymentConfirmed && (
            <PlanCountdownCard
              profile={profile}
              activePlan={activePlan}
              coachName={status.coachName ?? coach?.name}
            />
          )}
        </section>
      )}

      <section style={{ marginBottom: spacing[4] }}>
        <NotificationActivationGate />
        <PwaInstallPrompt />
      </section>
    </ClientShell>
  )
}

function resolvePrimaryAction(params: {
  status: ReturnType<typeof getClientDashboardStatus> | null
  activePlan: Plan | null
  coachingDayPending: boolean
  checkinAvailable: { type: Checkin['checkin_type']; href: string } | null
  todayTrackerPercent: number | null
  trackerSubtitle: string
  generationJob: InitialPlanGenerationJob | null
  planDelivered: boolean
  coachName: string | null
  unreadMessages: number
}): PrimaryAction {
  const {
    status,
    activePlan,
    coachingDayPending,
    checkinAvailable,
    todayTrackerPercent,
    trackerSubtitle,
    generationJob,
    planDelivered,
    coachName,
    unreadMessages,
  } = params

  if (checkinAvailable) {
    return {
      title: `${clientCheckinTypeLabel(checkinAvailable.type)} is ready`,
      detail: clientCheckinShortHint(checkinAvailable.type),
      href: checkinAvailable.href,
      cta: 'Start check-in',
      badge: 'Due now',
      tone: 'warning',
    }
  }

  if (status?.nextActionHref && status.nextAction) {
    return {
      title: 'Continue setup',
      detail: status.nextAction,
      href: status.nextActionHref,
      cta: 'Continue',
      tone: 'accent',
    }
  }

  if (!activePlan && (generationJob || !planDelivered)) {
    return {
      title: 'Your plan is on the way',
      detail: coachName
        ? `${coachName.split(' ')[0]} is preparing your diet and workout.`
        : 'Your coach is preparing your diet and workout.',
      href: '/plan',
      cta: 'View status',
      tone: 'muted',
    }
  }

  if (status?.showOpenPlanPrompt || (activePlan && !hasOpenedDietAndWorkout(activePlan))) {
    return {
      title: 'Open your plan',
      detail: 'Start with Diet and Workout — that’s your roadmap.',
      href: '/plan',
      cta: 'Open plan',
      badge: 'Start here',
      tone: 'accent',
    }
  }

  if (coachingDayPending) {
    return {
      title: 'Day one starts tomorrow',
      detail: 'Read your plan tonight so logging tomorrow feels easy.',
      href: '/plan',
      cta: 'Review plan',
      tone: 'muted',
    }
  }

  if (activePlan) {
    const done = todayTrackerPercent != null && todayTrackerPercent >= 100
    return {
      title: done ? 'You’re all set for today' : 'Log today’s habits',
      detail: done ? 'Nice work. Come back tomorrow, or message your coach anytime.' : trackerSubtitle,
      href: done ? '/client/chat' : '/tracker',
      cta: done ? (unreadMessages > 0 ? 'Read coach messages' : 'Message coach') : 'Open today’s log',
      badge: todayTrackerPercent != null ? `${todayTrackerPercent}%` : null,
      tone: done ? 'success' : 'accent',
    }
  }

  return {
    title: 'You’re all set up',
    detail: 'When your plan arrives, Today will tell you exactly what to do.',
    href: '/client/chat',
    cta: 'Message coach',
    tone: 'muted',
  }
}

function PrimaryActionCard({
  action,
  onOpen,
}: {
  action: PrimaryAction
  onOpen: (href: string) => void
}) {
  const toneBorder = {
    accent: 'rgba(249,115,22,0.28)',
    warning: 'rgba(245,158,11,0.35)',
    success: 'rgba(34,197,94,0.28)',
    muted: colors.borderSubtle,
  }[action.tone]

  const toneGlow = {
    accent: 'linear-gradient(145deg, rgba(249,115,22,0.18) 0%, rgba(17,24,39,0.96) 45%, rgba(9,9,11,0.99) 100%)',
    warning: 'linear-gradient(145deg, rgba(245,158,11,0.18) 0%, rgba(17,24,39,0.96) 45%, rgba(9,9,11,0.99) 100%)',
    success: 'linear-gradient(145deg, rgba(34,197,94,0.14) 0%, rgba(17,24,39,0.96) 45%, rgba(9,9,11,0.99) 100%)',
    muted: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(17,24,39,0.96) 50%, rgba(9,9,11,0.99) 100%)',
  }[action.tone]

  return (
    <Card
      variant="glass"
      className={motionClass.cardEnter}
      style={{
        overflow: 'hidden',
        background: toneGlow,
        border: `1px solid ${toneBorder}`,
        marginBottom: 0,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: colors.accent, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Next step
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 'clamp(1.35rem, 4.8vw, 1.75rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
          {action.title}
        </h2>
        {action.badge && (
          <span style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 800,
            color: colors.accent,
            background: colors.accentMuted,
            padding: '6px 10px',
            borderRadius: 999,
          }}>
            {action.badge}
          </span>
        )}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
        {action.detail}
      </p>
      <Button fullWidth style={{ marginTop: spacing[4] }} onClick={() => onOpen(action.href)}>
        {action.cta}
      </Button>
    </Card>
  )
}

function SectionLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 800,
          color: colors.textPrimary,
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function getTrackerHomeSummary(day: DailyTrackerDay): string {
  const selectedDiet = day.completion.selectedDietDay
  const selectedWorkout = day.completion.selectedWorkoutDay
  const hasDietDays = day.snapshot.items.some(
    (item) => item.type === 'meal' && Boolean(item.dietDay)
  )
  if (hasDietDays && !selectedDiet) return 'Choose which diet day you’re following'

  const hasWorkoutDays =
    Boolean(day.snapshot.workoutDays?.length) ||
    day.snapshot.items.some((item) => item.type === 'workout' && Boolean(item.workoutDay))
  if (hasWorkoutDays && !selectedWorkout && (day.snapshot.workoutDays?.length ?? 0) > 1) {
    return 'Choose which workout day you’re following'
  }

  const trackable = day.snapshot.items.filter((item) =>
    isTrackableForHome(item, selectedDiet, selectedWorkout ?? undefined)
  )
  if (trackable.length === 0) return 'Open to start today’s log'

  const done = trackable.filter((item) => isItemComplete(item, day.completion)).length
  const total = trackable.length
  if (done === total) return `${done}/${total} done — great work today`

  const next = trackable.find((item) => !isItemComplete(item, day.completion))
  return `${done}/${total} done · ${nextItemLabel(next)}`
}

function isTrackableForHome(
  item: TrackerSnapshotItem,
  selectedDietDay?: string | null,
  selectedWorkoutDay?: string
): boolean {
  if (item.type === 'note') return false
  if (item.type === 'meal' && item.dietDay) {
    if (!selectedDietDay) return false
    return item.dietDay === selectedDietDay
  }
  if (item.type === 'workout' && item.workoutDay) {
    if (!selectedWorkoutDay) return false
    return item.workoutDay === selectedWorkoutDay
  }
  return true
}

function nextItemLabel(item: TrackerSnapshotItem | undefined): string {
  if (!item) return 'Continue'
  switch (item.type) {
    case 'meal':
      return 'Meals next'
    case 'workout':
      return 'Workout next'
    case 'water':
      return 'Water next'
    case 'sleep':
      return 'Sleep next'
    case 'supplement':
      return 'Supplements next'
    case 'cardio':
      return 'Cardio next'
    default:
      return 'Continue'
  }
}
