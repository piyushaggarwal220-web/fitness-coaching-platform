'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Flame,
  ListChecks,
  MessageCircle,
  Timer,
  Trophy,
  LucideIcon,
} from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCheckinDate } from '@/lib/checkin';
import {
  getClientCheckinSchedule,
  getCheckinStatusLabel,
  getCheckinTypeDisplayName,
  hasCoachingDayStarted,
} from '@/lib/checkin-schedule';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { formatPlanDate } from '@/lib/plans';
import { clientFacingPlanTitle } from '@/lib/plan-metadata';
import { authenticateClient, getOnboardingLabel } from '@/lib/onboarding';
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore';
import { PlanCountdownCard } from '@/components/dashboard/PlanCountdown';
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard';
import { CheckinDueBanner } from '@/components/dashboard/CheckinDueBanner';
import { MembershipRenewalBanner } from '@/components/dashboard/MembershipRenewalBanner';
import { GoalUpgradeCard } from '@/components/dashboard/GoalUpgradeCard';
import { LeagueHomeCard } from '@/components/league/LeagueHomeCard';
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { getClientDashboardStatus } from '@/lib/purchase-dashboard';
import { getActiveSubscription, getMembershipRenewalPrompt } from '@/lib/subscription';
import { loadTodayTrackerView } from '@/lib/daily-tracker';
import { isItemComplete } from '@/lib/daily-tracker/scores';
import type { DailyTrackerDay, TrackerSnapshotItem } from '@/lib/daily-tracker/types';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing, typography } from '@/lib/design-tokens';
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
  const [trackerSubtitle, setTrackerSubtitle] = useState('Meals, workout, water & more');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const [generationJob, setGenerationJob] = useState<InitialPlanGenerationJob | null>(null);

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

        // If intake just finished but auto-gen never started, kick it again.
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
            })
            .catch(() => {})
        }

        if (planData) {
          void loadTodayTrackerView(supabase, userId, profileData).then(({ view }) => {
            if (!view) return;
            setTrackerStreak(view.streak);
            setTodayTrackerPercent(view.day.overall_percent ?? 0);
            setTrackerSubtitle(getTrackerHomeSummary(view.day));
          });
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
  const coachingDayPending = Boolean(profile?.checkin_schedule_started_at) && !coachingDayStarted;
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

  const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const quickLinks = [
    {
      key: 'tracker',
      title: 'Tracker',
      subtitle: trackerSubtitle,
      href: '/tracker',
      icon: ListChecks,
      badge: todayTrackerPercent != null ? `${todayTrackerPercent}%` : null,
      accent: colors.accent,
      visible: Boolean(activePlan),
    },
    {
      key: 'plan',
      title: 'Plan',
      subtitle: activePlan ? `${clientFacingPlanTitle(activePlan.title)} · v${activePlan.version}` : 'Open your coaching plan',
      href: '/plan',
      icon: ClipboardList,
      badge: activePlan ? 'Ready' : null,
      accent: '#60a5fa',
      visible: Boolean(profile),
    },
    {
      key: 'checkin',
      title: 'Check-in',
      subtitle: dueCheckin
        ? `${getCheckinTypeDisplayName(dueCheckin.type)} available now`
        : checkinSchedule?.nextCheckin
          ? `${getCheckinTypeDisplayName(checkinSchedule.nextCheckin.type)} · Day ${checkinSchedule.nextCheckin.coachingDay}`
          : 'Weekly accountability and coach review',
      href: dueCheckin ? dueCheckin.href : '/checkin',
      icon: Calendar,
      badge: dueCheckin ? 'Due' : null,
      accent: '#f59e0b',
      visible: true,
    },
    {
      key: 'journey',
      title: 'Journey',
      subtitle: 'Photos, check-ins, and progress history',
      href: '/journey',
      icon: Flame,
      badge: null,
      accent: '#a78bfa',
      visible: true,
    },
    {
      key: 'league',
      title: 'League',
      subtitle: 'Rank, points, and monthly climb',
      href: '/league',
      icon: Trophy,
      badge: null,
      accent: '#eab308',
      visible: true,
    },
    {
      key: 'chat',
      title: 'Coach chat',
      subtitle: unreadMessages > 0
        ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`
        : coach
          ? `Message ${coach.name}`
          : 'Message your coach',
      href: '/client/chat',
      icon: MessageCircle,
      badge: unreadMessages > 0 ? (unreadMessages > 9 ? '9+' : String(unreadMessages)) : null,
      accent: '#22c55e',
      visible: Boolean(coach),
    },
  ]
    .filter((item) => item.visible)
    .sort((a, b) => {
      if (dueCheckin) {
        if (a.key === 'checkin') return -1;
        if (b.key === 'checkin') return 1;
      }
      return 0;
    });

  const heroActionLabel = dueCheckin
    ? `Start ${getCheckinTypeDisplayName(dueCheckin.type)}`
    : status?.nextActionHref
      ? status.nextAction ?? 'Continue'
      : activePlan
        ? "Open today's tracker"
        : 'View your coaching dashboard';
  const heroActionHref = dueCheckin?.href
    ?? status?.nextActionHref
    ?? (activePlan ? '/tracker' : '/plan');
  const planCard = profile ? (
    <Card
      variant="glass"
      onClick={() => router.push('/plan')}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClipboardList size={22} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activePlan ? clientFacingPlanTitle(activePlan.title) : profile.plan_delivered ? 'Plan pending activation' : 'Plan in preparation'}
          </p>
          {activePlan && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
              v{activePlan.version} · Updated {formatPlanDate(activePlan.updated_at)}
            </p>
          )}
          {status?.coachName && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
              Coach: {status.coachName}
            </p>
          )}
        </div>
        <ArrowRight size={20} color={colors.textMuted} />
      </div>
    </Card>
  ) : null;
  const trackerCard = activePlan && coachingDayPending ? (
    <Card variant="glass">
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Timer size={22} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>Your first day starts tomorrow</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
            Daily tracking opens at 12:00 AM.
          </p>
        </div>
      </div>
    </Card>
  ) : activePlan ? (
    <Card
      variant={status?.preferTrackerUpTop ? 'elevated' : 'glass'}
      onClick={() => router.push('/tracker')}
      style={{ cursor: 'pointer' }}
      className={status?.preferTrackerUpTop ? 'card-hover' : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ListChecks size={22} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
            {status?.preferTrackerUpTop ? "Open today's tracker" : "Today's Tracker"}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
            {trackerSubtitle}
          </p>
        </div>
        {todayTrackerPercent != null && (
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: colors.accent,
            backgroundColor: colors.accentMuted,
            padding: '6px 10px',
            borderRadius: 999,
            flexShrink: 0,
          }}>
            {todayTrackerPercent}%
          </span>
        )}
        <ArrowRight size={20} color={colors.textMuted} />
      </div>
    </Card>
  ) : null;

  return (
    <ClientShell
      loading={loading}
      loadingMessage={restoringSession ? SESSION_RESTORE_MESSAGE : undefined}
    >
      {loadError && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[4] }}>
          {loadError}
        </div>
      )}

      {stickyCheckin && (
        <CheckinDueBanner
          checkin={stickyCheckin}
          mode={stickyCheckinMode}
          countdownLabel={
            checkinSchedule?.countdownDetailed ?? checkinSchedule?.countdownLabel
          }
        />
      )}
      {renewalPrompt && <MembershipRenewalBanner prompt={renewalPrompt} />}

      {generationJob && !activePlan && profile?.plan_delivered !== true && (
        <div style={{
          marginBottom: spacing[4],
          padding: spacing[3],
          borderRadius: 14,
          backgroundColor: generationJob.status === 'failed' ? colors.dangerMuted : colors.accentMuted,
          color: generationJob.status === 'failed' ? colors.danger : colors.textPrimary,
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          <strong>
            {generationJob.status === 'queued' || generationJob.status === 'generating'
              ? 'Your coach is preparing your personalized plan.'
              : generationJob.status === 'ready'
                ? 'Your coach is reviewing your plan and will share it with you soon.'
                : 'Your coach is working on your plan. Please check back shortly.'}
          </strong>
          <div>
            Your plan appears here only after your coach reviews and sends it.
          </div>
        </div>
      )}

      {/* Greeting */}
      <div style={{ marginBottom: spacing[6] }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: colors.accent,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Good {getGreeting()}
        </p>
        <h1 style={{ ...typography.pageTitle, marginTop: 6 }}>{firstName}</h1>
        <p style={{ margin: '10px 0 0', fontSize: 16, color: colors.textSecondary, lineHeight: 1.45 }}>
          Here&apos;s your coaching overview for today
        </p>
      </div>

      <section style={{ marginBottom: spacing[7] }}>
        <Card
          variant="glass"
          style={{
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(17,24,39,0.96) 42%, rgba(10,10,11,0.98) 100%)',
            border: '1px solid rgba(249,115,22,0.18)',
          }}
        >
          <div style={{ display: 'grid', gap: spacing[4] }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: colors.accent, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Coaching Hub
              </p>
              <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(1.55rem, 5vw, 2rem)', fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.12 }}>
                Everything important is one tap away
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.55 }}>
                Track today, open your plan, stay on top of check-ins, review your journey, and message your coach from one place.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing[2] }}>
              <DashboardHeroStat label="Week workouts" value={String(weekWorkouts)} icon={<Dumbbell size={17} />} />
              <DashboardHeroStat label="Streak" value={String(trackerStreak)} icon={<Flame size={17} />} />
              <DashboardHeroStat
                label="Today"
                value={todayTrackerPercent != null ? `${todayTrackerPercent}%` : '—'}
                icon={<Calendar size={17} />}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[2] }}>
              <Button onClick={() => router.push(heroActionHref)}>{heroActionLabel}</Button>
              <Button variant="secondary" onClick={() => router.push('/journey')}>
                Open journey
              </Button>
            </div>
          </div>
        </Card>
      </section>

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
        <SectionHeader
          title="Quick access"
          subtitle={
            dueCheckin
              ? 'Your due check-in is surfaced first, followed by the rest of your coaching tools'
              : 'Main coaching features, organized clearly'
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: spacing[3] }}>
          {quickLinks.map((item, index) => (
            <QuickLinkCard
              key={item.key}
              title={item.title}
              subtitle={item.subtitle}
              href={item.href}
              icon={item.icon}
              badge={item.badge}
              accent={item.accent}
              index={index}
              onOpen={(href) => router.push(href)}
            />
          ))}
        </div>
      </section>

      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Status" subtitle="Membership, delivery, and device setup" />
        {subscription && <ActiveSubscriptionCard subscription={subscription} />}
        {profile && status?.paymentConfirmed && (
          <PlanCountdownCard
            profile={profile}
            activePlan={activePlan}
            coachName={status.coachName ?? coach?.name}
          />
        )}
        <NotificationActivationGate />
        <PwaInstallPrompt />
      </section>

      {/* Keep plan and tracker together; tracker leads once daily tracking is preferred. */}
      {(profile || activePlan) && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader
            title="Plan & Tracker"
            subtitle={status?.preferTrackerUpTop
              ? 'Log today’s habits, then review your coaching plan'
              : 'Your coaching plan and daily tracking'}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
            {status?.preferTrackerUpTop ? (
              <>
                {trackerCard}
                {planCard}
              </>
            ) : (
              <>
                {planCard}
                {trackerCard}
              </>
            )}
          </div>
        </section>
      )}

      <LeagueHomeCard />

      {/* Coaching week + next check-in */}
      {checkinSchedule && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="This week" subtitle="Your coaching week and check-in schedule" />

          {checkinSchedule.developmentScheduleMessage ? (
            <Card variant="glass" style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.warningMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Timer size={22} color={colors.warning} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>Development Mode</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                    {checkinSchedule.developmentScheduleMessage}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card variant="glass" style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'grid', gap: spacing[3] }}>
                <div>
                  <p style={eyebrowLabel}>Current Coaching Week</p>
                  <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em' }}>
                    Week {checkinSchedule.activeCoachingWeek}
                  </p>
                </div>
                {checkinSchedule.nextCheckin && (
                  <>
                    <div>
                      <p style={eyebrowLabel}>Next Check-in</p>
                      <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
                        {getCheckinTypeDisplayName(checkinSchedule.nextCheckin.type)}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: colors.textSecondary }}>
                        Week {checkinSchedule.nextCheckin.coachingWeek} · Day {checkinSchedule.nextCheckin.coachingDay}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Timer size={20} color={colors.accent} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
                          {checkinSchedule.nextCheckinStatus === 'available'
                            ? 'Available now (48h window)'
                            : checkinSchedule.nextCheckinStatus === 'missed'
                              ? 'Missed — wait for next'
                              : 'Available in'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
                          {checkinSchedule.nextCheckinStatus === 'available'
                            ? 'Now'
                            : checkinSchedule.nextCheckinStatus === 'missed'
                              ? 'Closed'
                              : checkinSchedule.countdownDetailed ?? checkinSchedule.countdownLabel ?? 'Soon'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {checkinSchedule.weekCheckins.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
              {checkinSchedule.weekCheckins.map((task) => {
                const statusColor =
                  task.status === 'completed' ? colors.success :
                  task.status === 'available' ? colors.accent :
                  task.status === 'missed' ? colors.danger :
                  task.status === 'awaiting_review' ? colors.warning :
                  colors.textMuted
                const statusBg =
                  task.status === 'completed' ? colors.successMuted :
                  task.status === 'available' ? colors.accentMuted :
                  task.status === 'missed' ? colors.dangerMuted :
                  task.status === 'awaiting_review' ? colors.warningMuted :
                  colors.bgElevated

                return (
                  <Card key={`${task.type}-${task.coachingWeek}`} variant="elevated" interactive>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{getCheckinTypeDisplayName(task.type)}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                          Day {task.coachingDay}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: statusColor,
                          backgroundColor: statusBg,
                          padding: '6px 12px',
                          borderRadius: 999,
                        }}>
                          {getCheckinStatusLabel(task.status)}
                        </span>
                        {task.status === 'available' && (
                          <Button size="md" onClick={() => router.push(task.href)}>Start</Button>
                        )}
                        {task.status === 'missed' && (
                          <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 600, maxWidth: 120, textAlign: 'right' }}>
                            Window closed — wait for next
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Progress — this week / streak / today */}
      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Progress" subtitle="This week’s training pulse" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing[2] }}>
          <StatCard label="Week workouts" value={String(weekWorkouts)} icon={<Dumbbell size={18} />} />
          <StatCard label="Streak" value={String(trackerStreak)} icon={<Flame size={18} />} />
          <StatCard
            label="Today"
            value={todayTrackerPercent != null ? `${todayTrackerPercent}%` : '—'}
            icon={<Calendar size={18} />}
          />
        </div>
      </section>

      {/* Recent activity */}
      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Recent activity" subtitle="Latest check-ins and workouts" />
        <Card variant="elevated" padding={0} style={{ overflow: 'hidden' }}>
          {recentActivity.length === 0 ? (
            <p style={{ margin: 0, padding: spacing[4], color: colors.textMuted, fontSize: 15 }}>
              No activity yet. Log a workout or submit your first check-in.
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

function getTrackerHomeSummary(day: DailyTrackerDay): string {
  const selectedDiet = day.completion.selectedDietDay
  const selectedWorkout = day.completion.selectedWorkoutDay
  const hasDietDays = day.snapshot.items.some(
    (item) => item.type === 'meal' && Boolean(item.dietDay)
  )
  if (hasDietDays && !selectedDiet) return "Choose today's diet day"

  const hasWorkoutDays =
    Boolean(day.snapshot.workoutDays?.length) ||
    day.snapshot.items.some((item) => item.type === 'workout' && Boolean(item.workoutDay))
  if (hasWorkoutDays && !selectedWorkout && (day.snapshot.workoutDays?.length ?? 0) > 1) {
    return "Choose today's workout day"
  }

  const trackable = day.snapshot.items.filter((item) =>
    isTrackableForHome(item, selectedDiet, selectedWorkout ?? undefined)
  )
  if (trackable.length === 0) return "Open to start today's log"

  const done = trackable.filter((item) => isItemComplete(item, day.completion)).length
  const total = trackable.length
  if (done === total) return `${done}/${total} done — all set for today`

  const next = trackable.find((item) => !isItemComplete(item, day.completion))
  const nextLabel = nextItemLabel(next)
  return `${done}/${total} done · ${nextLabel}`
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
      return 'Meals left'
    case 'workout':
      return 'Workout left'
    case 'water':
      return 'Water left'
    case 'sleep':
      return 'Sleep left'
    case 'supplement':
      return 'Supplements left'
    case 'cardio':
      return 'Cardio left'
    default:
      return 'Continue'
  }
}

function DashboardHeroStat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: spacing[3],
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${colors.borderSubtle}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted, fontSize: 12, fontWeight: 700 }}>
        {icon}
        {label}
      </div>
      <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em' }}>
        {value}
      </div>
    </div>
  )
}

function QuickLinkCard({
  title,
  subtitle,
  href,
  icon: Icon,
  badge,
  accent,
  index,
  onOpen,
}: {
  title: string
  subtitle: string
  href: string
  icon: LucideIcon
  badge?: string | null
  accent: string
  index: number
  onOpen: (href: string) => void
}) {
  return (
    <Card
      variant="elevated"
      interactive
      staggerIndex={index}
      onClick={() => onOpen(href)}
      style={{ marginBottom: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: `${accent}22`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>{title}</p>
            {badge && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: 999,
                  backgroundColor: `${accent}22`,
                  color: accent,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: colors.textMuted }}>
            {subtitle}
          </p>
        </div>
        <ArrowRight size={18} color={colors.textMuted} />
      </div>
    </Card>
  )
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const eyebrowLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};
