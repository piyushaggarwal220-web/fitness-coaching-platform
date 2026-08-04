'use client'

import { Lock } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  ALL_PLAN_GOAL_OPTIONS,
  GOAL_BODY_TYPE_META,
  GOAL_BODY_TYPE_ORDER,
  PLAN_GOAL_MAX,
  PLAN_GOAL_MIN,
  PLAN_GOAL_TIER_META,
  PLAN_GOAL_TIER_ORDER,
  getGoalByValue,
  getGoalsForBodyType,
  isGoalUnlockedForPlan,
  isPhysiqueGoal,
  isValidGoalBodyType,
  planDisplayName,
  resolveGoalPlanTier,
  upgradeHrefForTier,
  type GoalBodyType,
  type PlanGoalOption,
  type PlanGoalTier,
} from '@/lib/plan-goals'

type PlanGoalSelectorProps = {
  planSlug: string | null | undefined
  gender?: string | null
  bodyType: string
  values: string[]
  onBodyTypeChange: (bodyType: GoalBodyType) => void
  onChange: (values: string[]) => void
}

export function PlanGoalSelector({
  planSlug,
  gender,
  bodyType,
  values,
  onBodyTypeChange,
  onChange,
}: PlanGoalSelectorProps) {
  const currentTier = resolveGoalPlanTier(planSlug)
  const selectedBodyType = isValidGoalBodyType(bodyType) ? bodyType : null
  const [upgradeTarget, setUpgradeTarget] = useState<PlanGoalOption | null>(null)

  const selectedCount = values.length
  const atMax = selectedCount >= PLAN_GOAL_MAX

  const bodyGoalsByTier = useMemo(() => {
    const map = {} as Record<PlanGoalTier, PlanGoalOption[]>
    for (const tier of PLAN_GOAL_TIER_ORDER) {
      map[tier] = getGoalsForBodyType(selectedBodyType, { gender, section: 'body' }).filter(
        (goal) => goal.tier === tier
      )
    }
    return map
  }, [selectedBodyType, gender])

  const physiqueGoalsByTier = useMemo(() => {
    const map = {} as Record<PlanGoalTier, PlanGoalOption[]>
    for (const tier of PLAN_GOAL_TIER_ORDER) {
      map[tier] = getGoalsForBodyType(selectedBodyType, { gender, section: 'physique' }).filter(
        (goal) => goal.tier === tier
      )
    }
    return map
  }, [selectedBodyType, gender])

  const hasPhysiqueGoals = PLAN_GOAL_TIER_ORDER.some((tier) => physiqueGoalsByTier[tier].length > 0)

  const toggle = (goal: PlanGoalOption) => {
    const unlocked = isGoalUnlockedForPlan(goal, currentTier)
    if (!unlocked) {
      setUpgradeTarget(goal)
      return
    }

    setUpgradeTarget(null)

    if (values.includes(goal.value)) {
      onChange(values.filter((value) => value !== goal.value))
      return
    }

    if (atMax) return
    onChange([...values, goal.value])
  }

  const selectBodyType = (next: GoalBodyType) => {
    setUpgradeTarget(null)
    onBodyTypeChange(next)
    // Drop goals that don't belong to the new path (physique goals stay).
    onChange(
      values.filter((value) => {
        const goal = getGoalByValue(value)
        if (!goal) return false
        if (isPhysiqueGoal(goal)) return true
        return goal.bodyTypes?.includes(next) ?? false
      })
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: spacing[3],
          padding: '12px 14px',
          borderRadius: radius.sm,
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>Your plan</p>
          <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
            {planDisplayName(currentTier)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>Selected</p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 15,
              fontWeight: 700,
              color:
                selectedCount >= PLAN_GOAL_MIN && selectedCount <= PLAN_GOAL_MAX
                  ? colors.accent
                  : colors.textPrimary,
            }}
          >
            {selectedCount} / {PLAN_GOAL_MAX}
          </p>
        </div>
      </div>

      <p style={{ ...s.stepHint, marginBottom: spacing[4] }}>
        First pick your starting point. Then choose at least {PLAN_GOAL_MIN} and up to {PLAN_GOAL_MAX}{' '}
        goals. Locked goals can be unlocked by upgrading your plan.
      </p>

      <section style={{ marginBottom: spacing[5] }}>
        <h3 style={sectionHeading}>1. Your starting point</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 }}>
          Pick the one that feels most like you right now.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {GOAL_BODY_TYPE_ORDER.map((type) => {
            const meta = GOAL_BODY_TYPE_META[type]
            const active = selectedBodyType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectBodyType(type)}
                aria-pressed={active}
                style={{
                  textAlign: 'left',
                  padding: '14px 14px',
                  borderRadius: 16,
                  border: active
                    ? '1px solid rgba(249,115,22,0.45)'
                    : `1px solid ${colors.borderSubtle}`,
                  background: active
                    ? 'linear-gradient(145deg, rgba(249,115,22,0.16), rgba(24,24,27,0.98))'
                    : colors.bgCard,
                  color: colors.textPrimary,
                  cursor: 'pointer',
                }}
              >
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{meta.title}</p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
                  {meta.description}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {selectedBodyType && (
        <section style={{ marginBottom: spacing[5] }}>
          <h3 style={sectionHeading}>2. Goals for {GOAL_BODY_TYPE_META[selectedBodyType].title.toLowerCase()}</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 }}>
            Choose at least {PLAN_GOAL_MIN}. Your {planDisplayName(currentTier)} plan unlocks included tiers.
          </p>

          {PLAN_GOAL_TIER_ORDER.map((tier) => {
            const goals = bodyGoalsByTier[tier]
            if (goals.length === 0) return null
            const meta = PLAN_GOAL_TIER_META[tier]
            const unlocked = planTierUnlocked(tier, currentTier)
            return (
              <div key={tier} style={{ marginBottom: spacing[4] }}>
                <TierHeader
                  tier={tier}
                  currentTier={currentTier}
                  unlocked={unlocked}
                  labelSuffix={
                    unlocked
                      ? tier === currentTier
                        ? 'Your plan'
                        : 'Included'
                      : 'Locked — upgrade'
                  }
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {goals.map((goal) =>
                    renderGoalChip({
                      goal,
                      selected: values.includes(goal.value),
                      locked: !unlocked,
                      blockedByMax: !values.includes(goal.value) && atMax,
                      onToggle: () => toggle(goal),
                    })
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {selectedBodyType && hasPhysiqueGoals && (
        <section style={{ marginBottom: spacing[4] }}>
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
            }}
          >
            <h3 style={{ ...sectionHeading, marginBottom: 6 }}>Optional physique focus</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
              {gender === 'female'
                ? 'Women-only shape goals you can add on top.'
                : gender === 'male'
                  ? 'Men-only shape goals you can add on top.'
                  : 'Optional shape goals for your profile.'}
            </p>
            {PLAN_GOAL_TIER_ORDER.map((tier) => {
              const goals = physiqueGoalsByTier[tier]
              if (goals.length === 0) return null
              const unlocked = planTierUnlocked(tier, currentTier)
              return (
                <div key={tier} style={{ marginBottom: spacing[3] }}>
                  <TierHeader
                    tier={tier}
                    currentTier={currentTier}
                    unlocked={unlocked}
                    labelSuffix={unlocked ? (tier === currentTier ? 'Your plan' : 'Included') : 'Locked'}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {goals.map((goal) =>
                      renderGoalChip({
                        goal,
                        selected: values.includes(goal.value),
                        locked: !unlocked,
                        blockedByMax: !values.includes(goal.value) && atMax,
                        onToggle: () => toggle(goal),
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {atMax && (
        <p style={{ margin: `0 0 ${spacing[3]}px`, fontSize: 13, color: colors.textMuted }}>
          Maximum of {PLAN_GOAL_MAX} goals reached. Deselect one to choose another.
        </p>
      )}

      {upgradeTarget && (
        <UpgradePrompt
          goal={upgradeTarget}
          currentTier={currentTier}
          onDismiss={() => setUpgradeTarget(null)}
        />
      )}

      {values.length > 0 && (
        <div
          style={{
            marginTop: spacing[2],
            paddingTop: spacing[3],
            borderTop: `1px solid ${colors.divider}`,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
            Your selection
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {values.map((value) => {
              const goal = getGoalByValue(value) ?? ALL_PLAN_GOAL_OPTIONS[0]
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange(values.filter((v) => v !== value))}
                  style={{ ...s.chip, ...s.chipSelected }}
                  title="Remove goal"
                >
                  {goal?.label ?? value}
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>×</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TierHeader({
  tier,
  currentTier,
  unlocked,
  labelSuffix,
}: {
  tier: PlanGoalTier
  currentTier: PlanGoalTier
  unlocked: boolean
  labelSuffix: string
}) {
  const meta = PLAN_GOAL_TIER_META[tier]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: unlocked ? meta.accent : colors.textMuted,
          flexShrink: 0,
        }}
      />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
        {meta.title}
        <span style={{ fontWeight: 500, color: colors.textMuted }}> · {labelSuffix}</span>
        {!unlocked && currentTier !== tier ? (
          <span style={{ fontWeight: 500, color: colors.warning }}> · Tap a goal to upgrade</span>
        ) : null}
      </p>
    </div>
  )
}

function renderGoalChip({
  goal,
  selected,
  locked,
  blockedByMax,
  onToggle,
}: {
  goal: PlanGoalOption
  selected: boolean
  locked: boolean
  blockedByMax: boolean
  onToggle: () => void
}) {
  return (
    <button
      key={goal.value}
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-disabled={blockedByMax}
      style={{
        ...s.chip,
        opacity: locked || blockedByMax ? 0.55 : 1,
        cursor: blockedByMax ? 'not-allowed' : 'pointer',
        borderStyle: locked ? 'dashed' : 'solid',
        ...(selected ? s.chipSelected : {}),
        ...(locked
          ? {
              backgroundColor: colors.bgSecondary,
              color: colors.textMuted,
              borderColor: colors.borderSubtle,
            }
          : {}),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {locked && <Lock size={12} strokeWidth={2.25} aria-hidden />}
      {goal.label}
    </button>
  )
}

function planTierUnlocked(tier: PlanGoalTier, currentTier: PlanGoalTier): boolean {
  return PLAN_GOAL_TIER_ORDER.indexOf(currentTier) >= PLAN_GOAL_TIER_ORDER.indexOf(tier)
}

function UpgradePrompt({
  goal,
  currentTier,
  onDismiss,
}: {
  goal: PlanGoalOption
  currentTier: PlanGoalTier
  onDismiss: () => void
}) {
  const requiredMeta = PLAN_GOAL_TIER_META[goal.tier]
  const currentMeta = PLAN_GOAL_TIER_META[currentTier]

  return (
    <div
      role="status"
      style={{
        marginTop: spacing[3],
        padding: '16px 16px 14px',
        borderRadius: radius.sm,
        backgroundColor: colors.warningMuted,
        border: '1px solid rgba(245, 158, 11, 0.28)',
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
        Upgrade to unlock “{goal.label}”
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: colors.textSecondary }}>
        This goal is part of the {requiredMeta.title} plan ({requiredMeta.shortLabel}). Your current{' '}
        {currentMeta.title} plan already includes shorter-plan goals — upgrade to add this one.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        <Link
          href={upgradeHrefForTier(goal.tier)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '0 16px',
            borderRadius: radius.sm,
            backgroundColor: colors.accent,
            color: colors.textInverse,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Upgrade to {requiredMeta.title}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            minHeight: 44,
            padding: '0 14px',
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            backgroundColor: colors.bgElevated,
            color: colors.textSecondary,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Keep current plan
        </button>
      </div>
    </div>
  )
}

const sectionHeading: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: colors.textPrimary,
  letterSpacing: '-0.01em',
}
