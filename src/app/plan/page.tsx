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
import { ClientShell } from '@/components/ui/ClientShell';
import { AccordionItem } from '@/components/ui/Accordion';
import { EmptyState } from '@/components/ui/EmptyState';
import { BRAND_NAME } from '@/lib/brand'
import { formatPlanDate } from '@/lib/plans';
import { resolvePlanSectionsFromPlan } from '@/lib/plan-section-parser';
import { authenticateClient } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing } from '@/lib/design-tokens';
import type { Plan } from '@/types/database';

const supabase = createClient();

type PlanSection = 'diet' | 'workout' | 'supplements' | 'cardio' | 'notes';

export default function ClientPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<PlanSection | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
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
          description="Your coach is preparing your personalised plan. Check back soon."
          actionLabel="Back to dashboard"
          onAction={() => router.push('/dashboard')}
        />
      </ClientShell>
    );
  }

  const sections = resolvePlanSectionsFromPlan(plan)

  const accordionItems = [
    { key: 'diet' as const, title: 'Diet', icon: <Apple size={20} />, content: sections.diet },
    { key: 'workout' as const, title: 'Workout', icon: <Dumbbell size={20} />, content: sections.workout },
    { key: 'supplements' as const, title: 'Supplements', icon: <Pill size={20} color={colors.accent} />, content: sections.supplements },
    { key: 'cardio' as const, title: 'Cardio', icon: <Footprints size={20} />, content: sections.cardio },
    { key: 'notes' as const, title: 'Coach Notes', icon: <ClipboardList size={20} />, content: sections.coachNotes },
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
          {BRAND_NAME} · Your Plan
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {plan.title}
        </h1>
        {plan.phase && <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 16 }}>{plan.phase}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[4], alignItems: 'center' }}>
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
    </ClientShell>
  );
}

function ClipboardListIcon() {
  return <ClipboardList size={40} color={colors.accent} strokeWidth={1.5} />;
}
