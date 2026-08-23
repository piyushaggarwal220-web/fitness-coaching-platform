'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Apple,
  ClipboardList,
  Dumbbell,
  Footprints,
  Pill,
} from 'lucide-react';
import { PlanChangeRequestPanel } from '@/components/plan/PlanChangeRequestPanel';
import { ClientShell } from '@/components/ui/ClientShell';
import { AccordionItem } from '@/components/ui/Accordion';
import { EmptyState } from '@/components/ui/EmptyState';
import { BRAND_NAME } from '@/lib/brand'
import { formatPlanDate } from '@/lib/plans';
import { formatPlanDayHeadersForClient } from '@/lib/plan-day-labels';
import { clientFacingPlanTitle, parsePlanMeta, extractWeekFromTitle } from '@/lib/plan-metadata';
import { planGoalName, planDurationLabel } from '@/lib/payments/plan-pages';
import { resolvePlanSectionsFromPlan } from '@/lib/plan-section-parser';
import { authenticateClient } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing } from '@/lib/design-tokens';
import type { Plan } from '@/types/database';
import { ADDON_PROTOCOL_HREF, ADDON_PROTOCOL_PAGE_TITLE, ADDON_PROTOCOL_SUBTITLE, entitledAddonIds, type AddonProtocolId } from '@/lib/addon-protocols';

const supabase = createClient();

type PlanSection = 'diet' | 'workout' | 'supplements' | 'cardio' | 'notes';

export default function ClientPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDelivered, setPlanDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<PlanSection | null>(null);
  const [entitledAddons, setEntitledAddons] = useState<AddonProtocolId[]>([])
  const [membershipName, setMembershipName] = useState('')
  const [membershipDuration, setMembershipDuration] = useState('')

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
      }

      setPlanDelivered(result.profile?.plan_delivered === true);
      setEntitledAddons(entitledAddonIds(result.profile));

      const { data: purchase } = await supabase
        .from('purchases')
        .select('plan_slug, plan_name, status, created_at')
        .eq('user_id', result.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (purchase?.plan_slug) {
        setMembershipName(planGoalName(purchase.plan_slug) || purchase.plan_name || '')
        setMembershipDuration(planDurationLabel(purchase.plan_slug))
      }

      const { data, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('client_id', result.user.id)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planError) {
        setError('Failed to load your plan.');
        setLoading(false);
        return;
      }

      setPlan(data);
      setLoading(false);
    };
    load();
  }, [router]);

  const markSectionOpened = async (section: 'diet' | 'workout') => {
    if (!plan) return
    const already =
      (section === 'diet' && plan.diet_opened_at) ||
      (section === 'workout' && plan.workout_opened_at)
    if (already) return

    const { error: rpcError } = await supabase.rpc('mark_plan_section_opened', {
      p_plan_id: plan.id,
      p_section: section,
    })
    if (rpcError) {
      console.warn('Could not mark plan section opened', rpcError.message)
      return
    }

    const now = new Date().toISOString()
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            diet_opened_at: section === 'diet' ? prev.diet_opened_at ?? now : prev.diet_opened_at,
            workout_opened_at:
              section === 'workout' ? prev.workout_opened_at ?? now : prev.workout_opened_at,
          }
        : prev
    )
  }

  const toggle = (section: PlanSection) => {
    setExpanded((current) => {
      const next = current === section ? null : section
      if (next === 'diet' || next === 'workout') {
        void markSectionOpened(next)
      }
      return next
    })
  };

  if (loading) {
    return <ClientShell title="Plan" loading />;
  }

  if (error) {
    return (
      <ClientShell title="Plan">
        <EmptyState
          icon={<ClipboardListIcon />}
          title="Could not load plan"
          description={error}
          actionLabel="Back to dashboard"
          onAction={() => router.push('/dashboard')}
        />
      </ClientShell>
    );
  }

  if (!plan) {
    return (
      <ClientShell title="Plan">
        <EmptyState
          icon={<ClipboardListIcon />}
          title="No active plan yet"
          description={
            planDelivered
              ? 'Your plan was delivered. If sections look empty, refresh or message your coach.'
              : 'Your coach is preparing your personalised plan. Check back soon.'
          }
          actionLabel="Back to dashboard"
          onAction={() => router.push('/dashboard')}
        />
      </ClientShell>
    );
  }

  const sections = resolvePlanSectionsFromPlan(plan)
  const planMeta = parsePlanMeta(plan)
  const weekNumber = planMeta.week ?? extractWeekFromTitle(plan.title)

  const accordionItems = [
    {
      key: 'diet' as const,
      title: 'Diet',
      icon: <Apple size={20} />,
      content: formatPlanDayHeadersForClient(sections.diet),
    },
    {
      key: 'workout' as const,
      title: 'Workout',
      icon: <Dumbbell size={20} />,
      content: formatPlanDayHeadersForClient(sections.workout),
    },
    { key: 'supplements' as const, title: 'Supplements', icon: <Pill size={20} color={colors.accent} />, content: sections.supplements },
    { key: 'cardio' as const, title: 'Cardio', icon: <Footprints size={20} />, content: sections.cardio },
    { key: 'notes' as const, title: 'Lifestyle & tips', icon: <ClipboardList size={20} />, content: sections.coachNotes },
  ].filter((item) => item.content.trim().length > 0)

  return (
    <ClientShell title="Plan">
      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, ${colors.bgElevated} 0%, ${colors.bgCard} 100%)`,
          borderRadius: 20,
          padding: spacing[5],
          marginBottom: spacing[5],
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {BRAND_NAME} · {membershipDuration || 'Your Plan'}
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {membershipName || clientFacingPlanTitle(plan.title)}
        </h1>
        {membershipName ? (
          <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 16 }}>
            {clientFacingPlanTitle(plan.title)}
          </p>
        ) : plan.phase ? (
          <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 16 }}>{plan.phase}</p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[4], alignItems: 'center' }}>
          {weekNumber != null && (
            <span style={{ backgroundColor: colors.accentMuted, color: colors.accent, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
              Week {weekNumber}
            </span>
          )}
          <span style={{ backgroundColor: colors.accentMuted, color: colors.accent, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
            v{plan.version}
          </span>
          <span style={{ fontSize: 13, color: colors.textMuted }}>Updated {formatPlanDate(plan.updated_at)}</span>
          {plan.delivered_at && (
            <span style={{ fontSize: 13, color: colors.textMuted }}>Delivered {formatPlanDate(plan.delivered_at)}</span>
          )}
        </div>
      </div>

      {/* Accordions */}
      <div>
        {accordionItems.map(({ key, title, icon, content }) => (
          <AccordionItem
            key={key}
            title={title}
            icon={icon}
            isOpen={expanded === key}
            onToggle={() => toggle(key)}
          >
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: colors.textSecondary, fontSize: 15, paddingBottom: spacing[2] }}>
              {content}
            </div>
          </AccordionItem>
        ))}
      </div>

      {entitledAddons.map((addonId) => (
        <Link
          key={addonId}
          href={ADDON_PROTOCOL_HREF[addonId]}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing[3],
            marginTop: spacing[4],
            padding: spacing[4],
            borderRadius: 16,
            border: `1px solid ${colors.borderSubtle}`,
            backgroundColor: colors.bgCard,
            textDecoration: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
            <Pill size={20} color={colors.accent} aria-hidden />
            <span>
              <span style={{ display: 'block', fontWeight: 700, color: colors.textPrimary }}>
                {ADDON_PROTOCOL_PAGE_TITLE[addonId]}
              </span>
              <span style={{ display: 'block', fontSize: 13, color: colors.textMuted }}>
                {ADDON_PROTOCOL_SUBTITLE[addonId]}
              </span>
            </span>
          </span>
          <span style={{ color: colors.accent, fontSize: 20 }} aria-hidden>›</span>
        </Link>
      ))}

      <PlanChangeRequestPanel />
    </ClientShell>
  );
}

function ClipboardListIcon() {
  return <ClipboardList size={40} color={colors.accent} strokeWidth={1.5} />;
}
