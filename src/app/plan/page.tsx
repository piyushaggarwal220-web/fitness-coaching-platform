'use client';

import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/Button';
import { formatPlanDate } from '@/lib/plans';
import { clientFacingPlanTitle } from '@/lib/plan-metadata';
import { resolvePlanSectionsFromPlan } from '@/lib/plan-section-parser';
import { authenticateClient } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing } from '@/lib/design-tokens';
import { motionClass } from '@/lib/motion';
import type { Plan } from '@/types/database';

const supabase = createClient();

type PlanSection = 'diet' | 'workout' | 'supplements' | 'cardio' | 'notes';

export default function ClientPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDelivered, setPlanDelivered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<PlanSection | null>('diet');

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
      }

      setPlanDelivered(result.profile?.plan_delivered === true);

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
      if (data && !data.diet_opened_at) {
        setExpanded('diet')
      } else if (data && !data.workout_opened_at) {
        setExpanded('workout')
      }
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
          actionLabel="Back to Today"
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
          title="Your plan isn’t ready yet"
          description={
            planDelivered
              ? 'Your coach has sent a plan. Pull to refresh, or message your coach if sections look empty.'
              : 'Your coach is building your personal diet and workout. You’ll get a clear next step on Today when it’s ready.'
          }
          actionLabel="Back to Today"
          onAction={() => router.push('/dashboard')}
        />
      </ClientShell>
    );
  }

  const sections = resolvePlanSectionsFromPlan(plan)

  const accordionItems = [
    { key: 'diet' as const, title: 'Diet', hint: 'What to eat', icon: <Apple size={20} />, content: sections.diet },
    { key: 'workout' as const, title: 'Workout', hint: 'What to train', icon: <Dumbbell size={20} />, content: sections.workout },
    { key: 'supplements' as const, title: 'Supplements', hint: 'Optional extras', icon: <Pill size={20} color={colors.accent} />, content: sections.supplements },
    { key: 'cardio' as const, title: 'Cardio', hint: 'Steps & movement', icon: <Footprints size={20} />, content: sections.cardio },
    { key: 'notes' as const, title: 'Coach notes', hint: 'Personal guidance', icon: <ClipboardList size={20} />, content: sections.coachNotes },
  ].filter((item) => item.content.trim().length > 0)

  const needsOpenCore = !plan.diet_opened_at || !plan.workout_opened_at

  return (
    <ClientShell title="Plan">
      <div
        className={motionClass.cardEnter}
        style={{
          background: `linear-gradient(145deg, rgba(249,115,22,0.14) 0%, ${colors.bgElevated} 42%, ${colors.bgCard} 100%)`,
          borderRadius: 20,
          padding: spacing[5],
          marginBottom: spacing[4],
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Your coaching plan
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {clientFacingPlanTitle(plan.title)}
        </h1>
        <p style={{ margin: '10px 0 0', color: colors.textSecondary, fontSize: 15, lineHeight: 1.5 }}>
          Tap <strong style={{ color: colors.textPrimary, fontWeight: 700 }}>Diet</strong> and{' '}
          <strong style={{ color: colors.textPrimary, fontWeight: 700 }}>Workout</strong> first.
          Then log them every day from Today.
        </p>
        {plan.phase && (
          <p style={{ margin: '10px 0 0', color: colors.textMuted, fontSize: 14 }}>
            Phase: {plan.phase}
          </p>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.textMuted }}>
          Last updated {formatPlanDate(plan.updated_at)}
        </p>
      </div>

      {needsOpenCore && (
        <div
          style={{
            marginBottom: spacing[4],
            padding: spacing[3],
            borderRadius: 14,
            background: colors.accentMuted,
            border: '1px solid rgba(249,115,22,0.2)',
            fontSize: 14,
            color: colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: colors.textPrimary }}>Tip:</strong> Open Diet and Workout once so we know you’ve seen your plan. Daily logging unlocks after that.
        </div>
      )}

      <div style={{ marginBottom: spacing[4] }}>
        <Button fullWidth variant="secondary" onClick={() => router.push('/tracker')}>
          Go log today
        </Button>
      </div>

      <div>
        {accordionItems.map(({ key, title, hint, icon, content }) => (
          <AccordionItem
            key={key}
            title={title}
            icon={icon}
            isOpen={expanded === key}
            onToggle={() => toggle(key)}
          >
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textMuted }}>{hint}</p>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: colors.textSecondary, fontSize: 15, paddingBottom: spacing[2] }}>
              {content}
            </div>
          </AccordionItem>
        ))}
      </div>

      <div style={{ marginTop: spacing[5] }}>
        <PlanChangeRequestPanel />
      </div>
    </ClientShell>
  );
}

function ClipboardListIcon() {
  return <ClipboardList size={40} color={colors.accent} strokeWidth={1.5} />;
}
