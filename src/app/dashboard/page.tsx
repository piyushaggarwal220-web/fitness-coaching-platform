'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  Dumbbell,
} from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Card } from '@/components/ui/Card';
import { formatCheckinDate } from '@/lib/checkin';
import {
  getClientCheckinSchedule,
  getCheckinTypeDisplayName,
  hasCoachingDayStarted,
} from '@/lib/checkin-schedule';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { clientFacingPlanTitle } from '@/lib/plan-metadata';
import { planGoalName } from '@/lib/payments/plan-pages';
import { isAutoDeliveryCoach } from '@/lib/coach-delivery-policy';
import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window';
import { isDigitalPlanSlug } from '@/lib/payments/plans';
import { authenticateClient, getOnboardingLabel } from '@/lib/onboarding';
import { useInstantLockState } from '@/hooks/useInstantLockState';
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore';
import { PlanCountdownCard } from '@/components/dashboard/PlanCountdown';
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard';
import { CheckinDueBanner } from '@/components/dashboard/CheckinDueBanner';
import { MembershipRenewalBanner } from '@/components/dashboard/MembershipRenewalBanner';
import { GoalUpgradeCard } from '@/components/dashboard/GoalUpgradeCard';
import { TodayFocus } from '@/components/dashboard/TodayFocus';
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation';
import { isPublicDemoEmail, PUBLIC_DEMO_CLIENT_NAME } from '@/lib/public-demo';
import { CHAT_AFTER_ENROLLMENT_MESSAGE } from '@/lib/chat-availability';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { getClientDashboardStatus } from '@/lib/purchase-dashboard';
import { getActiveSubscription, getMembershipRenewalPrompt } from '@/lib/subscription';
import { loadTodayTrackerView } from '@/lib/daily-tracker';
import { buildModuleSummaries, type TrackerModuleSummary } from '@/lib/daily-tracker/module-summaries';
import { createClient } from '@/lib/supabase/client';
import { clientColors as colors, spacing, typography } from '@/lib/design-tokens';
import { mobileStyles } from '@/lib/mobile-styles';
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase, Workout } from '@/types/database';
import type { InitialPlanGenerationJob } from '@/lib/initial-plan-generation';

const supabase = createClient();

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
};

type DashboardCheckin = Pick<
  Checkin,
  'id' | 'client_id' | 'checkin_type' | 'submitted_at' | 'coaching_week' | 'coaching_day' | 'reviewed'
>;

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [allCheckins, setAllCheckins] = useState<DashboardCheckin[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState(0);
  const [trackerStreak, setTrackerStreak] = useState(0);
  const [todayTrackerPercent, setTodayTrackerPercent] = useState<number | null>(null);
  const [todayModules, setTodayModules] = useState<TrackerModuleSummary[] | null>(null);
  const [trackerSubtitle, setTrackerSubtitle] = useState('Meals, workout, water & more');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const [generationJob, setGenerationJob] = useState<InitialPlanGenerationJob | null>(null);
  const { locked: instantLocked } = useInstantLockState();

  useEffect(() => {
    if (!profile?.checkin_schedule_started_at) return;
    const timer = window.setInterval(() => setScheduleNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [profile?.checkin_schedule_started_at]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const result = await authenticateClient(supabase, router, {
          requireOnboarding: true,
          requirePayment: true,
        });
        setRestoringSession(false);
        if (!result) {
          setLoading(false);
          return;
        }

        const profileData = result.profile;

        if (result.profileError && !profileData) {
          setLoadError('Could not load your profile. Please refresh the page.');
          setLoading(false);
          return;
        }

        if (!profileData) {
          setLoadError('Your profile could not be loaded. Please refresh or log in again.');
          setLoading(false);
          return;
        }

        setUser(result.user as User);
        setProfile(profileData);

        const userId = result.user.id;
        const activity: ActivityItem[] = [];
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);
        const coachId = profileData.coach_id;

        const [
          checkinResult,
          planResult,
          purchaseResult,
          workoutsResult,
          weekWorkoutsResult,
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
            .select('id, client_id, coach_id, title, phase, version, active, delivered_at, updated_at, created_at, diet_opened_at, workout_opened_at, coach_notes')
            .eq('client_id', userId)
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('purchases')
            .select('id, user_id, status, amount_paise, currency, created_at, plan_name, plan_slug')
            .eq('user_id', userId)
            .neq('plan_slug', 'exercise_library')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('workouts')
            .select('id, user_id, name, date, created_at, duration, calories')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('workouts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('date', weekAgoStr),
          coachId
            ? supabase.from('coaches').select('id, name, user_id, hard_cap, bio, display_photo_path').eq('id', coachId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          coachId
            ? supabase.from('coach_conversations').select('unread_by_client').eq('client_id', userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('initial_plan_generation_jobs')
            .select('id, client_id, status, error_message, updated_at')
            .eq('client_id', userId)
            .maybeSingle(),
        ]);

        if (checkinResult.error) throw new Error(checkinResult.error.message);
        if (planResult.error) throw new Error(planResult.error.message);
        if (purchaseResult.error) throw new Error(purchaseResult.error.message);
        if (workoutsResult.error) throw new Error(workoutsResult.error.message);
        if (weekWorkoutsResult.error) throw new Error(weekWorkoutsResult.error.message);
        if (coachResult.error) throw new Error(coachResult.error.message);
        if (convResult.error) throw new Error(convResult.error.message);
        if (generationResult.error) throw new Error(generationResult.error.message);

        const checkinList = (checkinResult.data ?? []) as DashboardCheckin[];
        setAllCheckins(checkinList);
        const latestCheckin = checkinList[0] ?? null;

        if (latestCheckin) {
          activity.push({
            id: `checkin-${latestCheckin.id}`,
            icon: <ClipboardList size={18} color={colors.accent} />,
            title: `${latestCheckin.checkin_type === 'mid_week' ? 'Day 3' : 'Weekly'} check-in submitted`,
            subtitle: formatCheckinDate(latestCheckin.submitted_at),
            href: '/journey',
          });
        }

        const planData = planResult.data as Plan | null;
        setActivePlan(planData);
        setPurchase(purchaseResult.data as Purchase | null);
        setWeekWorkouts(weekWorkoutsResult.count ?? 0);

        const workouts = (workoutsResult.data ?? []) as Workout[];
        for (const w of workouts.slice(0, 3)) {
          activity.push({
            id: `workout-${w.id}`,
            icon: <Dumbbell size={18} color={colors.accent} />,
            title: `Completed workout — ${w.name}`,
            subtitle: new Date(w.date ?? w.created_at).toLocaleString(),
            href: '/workouts',
          });
        }
        setRecentActivity(activity.slice(0, 5));

        if (coachResult.data) setCoach(coachResult.data as Coach);
        setUnreadMessages((convResult.data?.unread_by_client as number) ?? 0);
        setGenerationJob(generationResult.data as InitialPlanGenerationJob | null);

        // Paint the dashboard first; tracker summary can fill in afterwards.
        setLoading(false);

        // If intake finished but gen never started / stuck / ready-but-undelivered, kick again.
        const job = generationResult.data as InitialPlanGenerationJob | null
        const needsEnsure =
          profileData.onboarding_complete &&
          !profileData.plan_delivered &&
          !planData &&
          (!job ||
            job.status === 'queued' ||
            job.status === 'failed' ||
            job.status === 'ready')
        if (needsEnsure) {
          void fetch('/api/onboarding/ensure-generation', {
            method: 'POST',
            credentials: 'include',
          })
            .then(async (res) => {
              if (!res.ok) return
              const body = (await res.json().catch(() => null)) as
                | { status?: string }
                | null
              if (!body?.status) return
              const { data: refreshed } = await supabase
                .from('initial_plan_generation_jobs')
                .select('id, client_id, status, error_message, updated_at')
                .eq('client_id', userId)
                .maybeSingle()
              if (refreshed) setGenerationJob(refreshed as InitialPlanGenerationJob)
              // Delivery may land right after ensure — refresh plan if it appeared.
              if (body.status === 'generating' || body.status === 'ready') {
                const { data: deliveredPlan } = await supabase
                  .from('plans')
                  .select('*')
                  .eq('client_id', userId)
                  .eq('is_active', true)
                  .maybeSingle()
                if (deliveredPlan) {
                  setActivePlan(deliveredPlan as Plan)
                  setGenerationJob(null)
                }
              }
            })
            .catch(() => {})
        }

        if (planData) {
          void loadTodayTrackerView(supabase, userId, profileData).then(({ view }) => {
            if (!view) {
              setTodayModules([]);
              return;
            }
            setTrackerStreak(view.streak);
            setTodayTrackerPercent(view.day.overall_percent ?? 0);
            setTodayModules(buildModuleSummaries(view.day));
          });
        } else {
          setTodayModules([]);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  const status = profile
    ? getClientDashboardStatus({ profile, purchase, coach, activePlan })
    : null;

  const subscription = getActiveSubscription(
    purchase,
    profile?.subscription_expires_at ?? null
  );
  const renewalPrompt = getMembershipRenewalPrompt(profile, purchase);

  const checkinScheduleBypass = shouldBypassCheckinScheduleClient();
  const coachingDayStarted = profile?.checkin_schedule_started_at
    ? hasCoachingDayStarted(profile.checkin_schedule_started_at, scheduleNow)
    : false;
  const checkinSchedule = profile?.checkin_schedule_started_at && coachingDayStarted
    ? getClientCheckinSchedule(profile.checkin_schedule_started_at, allCheckins, scheduleNow, {
        bypassSchedule: checkinScheduleBypass,
      })
    : null;
  /** Prefer schedule "next" when open; fall back to any available slot this week (e.g. weekly after mid-week missed). */
  const dueCheckin =
    checkinSchedule?.nextCheckinStatus === 'available' && checkinSchedule.nextCheckin
      ? checkinSchedule.nextCheckin
      : checkinSchedule?.weekCheckins.find((task) => task.status === 'available') ?? null;
  /**
   * The sticky banner is always shown once the schedule is anchored: the open window when a
   * check-in is due, otherwise a countdown to the next Wednesday / Sunday slot. Late-week
   * starters skip their first slots, so this is how they learn when they are actually up.
   */
  const stickyCheckin = dueCheckin ?? checkinSchedule?.nextCheckin ?? null;
  const stickyCheckinMode = dueCheckin ? 'due' : 'countdown';
  const chatReady = Boolean(coach) && !isPublicDemoEmail(user?.email);

  const rawName = (profile?.name || user?.email?.split('@')[0] || 'there').trim()
  // Public demo is "Demo Client" — keep the full label (do not split to "Demo").
  const firstName = isPublicDemoEmail(user?.email)
    ? PUBLIC_DEMO_CLIENT_NAME
    : rawName.split(/\s+/)[0]

  const selectedGoals = profile?.onboarding_data?.goals?.selectedGoals
  const goalLabel = selectedGoals && selectedGoals.length > 0
    ? selectedGoals.map((goal) => getOnboardingLabel('fitness_goal', goal)).join(', ')
    : profile
      ? getOnboardingLabel('fitness_goal', profile.fitness_goal)
      : ''
  const contextLine = [
    goalLabel && goalLabel !== '—' ? goalLabel : null,
    activePlan
      ? clientFacingPlanTitle(activePlan.title)
      : purchase?.plan_slug
        ? planGoalName(purchase.plan_slug)
        : null,
    checkinSchedule ? `Week ${checkinSchedule.activeCoachingWeek}` : null,
  ].filter(Boolean).join(' · ')

  const upcomingCheckin = dueCheckin ?? checkinSchedule?.nextCheckin ?? null
  const nextCheckinFocus = upcomingCheckin
    ? {
        label: `${getCheckinTypeDisplayName(upcomingCheckin.type)} · Week ${upcomingCheckin.coachingWeek}`,
        detail: dueCheckin
          ? 'Due now. Photos and answers go to Smart Coach.'
          : checkinSchedule?.countdownDetailed
            ? `Opens in ${checkinSchedule.countdownDetailed}`
            : checkinSchedule?.countdownLabel
              ? `Opens in ${checkinSchedule.countdownLabel}`
              : 'Not open yet',
        href: dueCheckin ? dueCheckin.href : '/checkin',
        due: Boolean(dueCheckin),
      }
    : null

  return (
    <ClientShell
      loading={loading}
      loadingMessage={restoringSession ? SESSION_RESTORE_MESSAGE : undefined}
    >
      {loadError && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[4] }}>
          <p style={{ margin: '0 0 12px' }}>{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: colors.accent,
              color: colors.textInverse,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}

      {stickyCheckin && !isPublicDemoEmail(user?.email) && !instantLocked.tracker && (
        <CheckinDueBanner
          checkin={stickyCheckin}
          mode={stickyCheckinMode}
          countdownLabel={
            checkinSchedule?.countdownDetailed ?? checkinSchedule?.countdownLabel
          }
        />
      )}
      {renewalPrompt && !isPublicDemoEmail(user?.email) && (
        <MembershipRenewalBanner prompt={renewalPrompt} />
      )}

      {generationJob &&
        !activePlan &&
        profile?.plan_delivered !== true &&
        profile?.onboarding_complete && (
        <div style={{
          marginBottom: spacing[4],
          padding: spacing[3],
          borderRadius: 14,
          backgroundColor: generationJob?.status === 'failed' ? colors.dangerMuted : colors.accentMuted,
          color: generationJob?.status === 'failed' ? colors.danger : colors.textPrimary,
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          <strong>
            {isDigitalPlanSlug(purchase?.plan_slug)
              ? generationJob.status === 'ready'
                ? 'Your customised plan is almost ready.'
                : generationJob.status === 'failed'
                  ? 'We hit a snag building your plan — retry from onboarding or contact support.'
                  : 'Building your customised plan…'
              : generationJob.status === 'queued' || generationJob.status === 'generating'
              ? 'Smart Coach is building your personalized plan.'
              : generationJob.status === 'ready'
                ? 'Your plan is almost ready — finishing delivery now.'
                : generationJob.status === 'failed'
                  ? 'We hit a snag building your plan. Check back shortly.'
                  : 'Smart Coach is building your personalized plan.'}
          </strong>
          <div>
            {isDigitalPlanSlug(purchase?.plan_slug) || isAutoDeliveryCoach(profile?.coach_id)
              ? `You’ll get an email when it’s ready, and it will also appear in My Plan (within ${INSTANT_PLAN_WINDOW_LABEL}).`
              : 'It usually arrives within 24 hours and appears in My Plan automatically.'}
          </div>
        </div>
      )}

      <TodayFocus
        firstName={firstName}
        contextLine={contextLine}
        modules={activePlan && !instantLocked.tracker ? todayModules : []}
        unreadMessages={unreadMessages}
        showChat={chatReady}
        weekWorkouts={weekWorkouts}
        streak={trackerStreak}
        todayPercent={todayTrackerPercent}
        nextCheckin={nextCheckinFocus}
        missedCount={checkinSchedule?.missedCheckins.length ?? 0}
      />

      {checkinScheduleBypass && (
        <DevelopmentModeBadge style={{ marginBottom: spacing[4] }} />
      )}

      <GoalUpgradeCard
        planSlug={purchase?.plan_slug}
        accessSource={profile?.access_source}
        gender={profile?.gender}
        bodyType={profile?.onboarding_data?.goals?.startingBodyType}
      />

      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Status" subtitle="Membership, delivery, and device setup" />
        {subscription && <ActiveSubscriptionCard subscription={subscription} />}
        {profile && status?.paymentConfirmed && (
          <PlanCountdownCard
            profile={profile}
            activePlan={activePlan}
            coachName={status.coachName ?? coach?.name}
            coachBio={coach?.bio}
            coachPhotoPath={coach?.display_photo_path}
            planSlug={purchase?.plan_slug}
          />
        )}
        {!isPublicDemoEmail(user?.email) && <NotificationActivationGate />}
        <PwaInstallPrompt />
      </section>

      {/* Recent activity */}
      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Recent activity" subtitle="Latest check-ins and workouts" />
        <Card variant="elevated" padding={0} style={{ overflow: 'hidden' }}>
          {recentActivity.length === 0 ? (
            <p style={{ margin: 0, padding: spacing[4], color: colors.textMuted, fontSize: 15 }}>
              Your coaching activity will appear here after your first workout or check-in.
            </p>
          ) : (
            recentActivity.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  width: '100%',
                  padding: `${spacing[3]}px ${spacing[4]}px`,
                  border: 'none',
                  borderBottom: i < recentActivity.length - 1 ? `1px solid ${colors.divider}` : 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                {item.icon}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>{item.subtitle}</p>
                </div>
                <ArrowRight size={16} color={colors.textMuted} />
              </button>
            ))
          )}
        </Card>
      </section>

      {/* Onboarding summary — collapsed by default */}
      {profile && (
        <section>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginBottom: profileOpen ? spacing[3] : 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-expanded={profileOpen}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.25rem, 4.5vw, 1.5rem)',
                  fontWeight: 800,
                  color: colors.textPrimary,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                }}
              >
                Your profile
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted, lineHeight: 1.4 }}>
                Key details from onboarding
              </p>
            </div>
            <ChevronDown
              size={22}
              color={colors.textMuted}
              style={{
                transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 150ms ease',
                flexShrink: 0,
              }}
            />
          </button>
          {profileOpen && (
            <Card variant="elevated">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing[3] }}>
                <GlanceItem
                  label="Goal"
                  value={
                    profile.onboarding_data?.goals?.selectedGoals &&
                    profile.onboarding_data.goals.selectedGoals.length > 0
                      ? profile.onboarding_data.goals.selectedGoals
                          .map((goal) => getOnboardingLabel('fitness_goal', goal))
                          .join(', ')
                      : getOnboardingLabel('fitness_goal', profile.fitness_goal)
                  }
                />
                <GlanceItem label="Training" value={getOnboardingLabel('training_experience', profile.training_experience)} />
                <GlanceItem label="Weight" value={profile.weight ? `${profile.weight} kg` : '—'} />
                <GlanceItem label="Age" value={profile.age ? `${profile.age} yrs` : '—'} />
              </div>
            </Card>
          )}
        </section>
      )}
    </ClientShell>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'clamp(1.25rem, 4.5vw, 1.5rem)',
          fontWeight: 800,
          color: colors.textPrimary,
          letterSpacing: '-0.03em',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted, lineHeight: 1.4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function GlanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700 }}>{value}</p>
    </div>
  );
}
