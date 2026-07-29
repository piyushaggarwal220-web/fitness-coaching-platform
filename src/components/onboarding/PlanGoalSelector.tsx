'use client'

import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  ALL_PLAN_GOAL_OPTIONS,
  PLAN_GOAL_MAX,
  PLAN_GOAL_MIN,
  PLAN_GOAL_TIER_META,
  PLAN_GOAL_TIER_ORDER,
  PLAN_GOALS_BY_TIER,
  getGoalByValue,
  isGoalUnlockedForPlan,
  planDisplayName,
  resolveGoalPlanTier,
  upgradeHrefForTier,
  type PlanGoalOption,
  type PlanGoalTier,
} from '@/lib/plan-goals'

type PlanGoalSelectorProps = {
  planSlug: string | null | undefined
  values: string[]
  onChange: (values: string[]) => void
}

export function PlanGoalSelector({ planSlug, values, onChange }: PlanGoalSelectorProps) {
  const currentTier = resolveGoalPlanTier(planSlug)
  const [upgradeTarget, setUpgradeTarget] = useState<PlanGoalOption | null>(null)

  const selectedCount = values.length
  const atMax = selectedCount >= PLAN_GOAL_MAX

  const { includedTiers, lockedTiers, includedTierLabel } = useMemo(() => {
    const included = PLAN_GOAL_TIER_ORDER.filter((tier) => planTierUnlocked(tier, currentTier))
    const locked = PLAN_GOAL_TIER_ORDER.filter((tier) => !planTierUnlocked(tier, currentTier))
    const label =
      included.length === 1
        ? PLAN_GOAL_TIER_META[included[0]].title
        : included.map((tier) => PLAN_GOAL_TIER_META[tier].title).join(' + ')
    return { includedTiers: included, lockedTiers: locked, includedTierLabel: label }
  }, [currentTier])

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
        Choose at least {PLAN_GOAL_MIN} and up to {PLAN_GOAL_MAX} goals. Your {planDisplayName(currentTier)}{' '}
        plan includes every goal from shorter plans
        {includedTiers.length > 1 ? ` (${includedTierLabel})` : ''}. Longer-plan goals stay locked until you
        upgrade.
      </p>

      <section style={{ marginBottom: spacing[5] }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: spacing[3],
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: colors.textPrimary,
              letterSpacing: '-0.01em',
            }}
          >
            Available on your plan
          </h3>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: colors.success,
            }}
          >
            Selectable
          </span>
        </div>

        {includedTiers.map((tier) => {
          const meta = PLAN_GOAL_TIER_META[tier]
          const isCurrent = tier === currentTier
          const isShorter = PLAN_GOAL_TIER_ORDER.indexOf(tier) < PLAN_GOAL_TIER_ORDER.indexOf(currentTier)

          return (
            <div key={tier} style={{ marginBottom: spacing[4] }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: meta.accent,
                    flexShrink: 0,
                  }}
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.textSecondary,
                  }}
                >
                  {meta.title}
                  <span style={{ fontWeight: 500, color: colors.textMuted }}>
                    {isCurrent
                      ? ' · Your plan'
                      : isShorter
                        ? ' · Included from shorter plan'
                        : ` · ${meta.shortLabel}`}
                  </span>
                </p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PLAN_GOALS_BY_TIER[tier].map((goal) =>
                  renderGoalChip({
                    goal,
                    selected: values.includes(goal.value),
                    locked: false,
                    blockedByMax: !values.includes(goal.value) && atMax,
                    onToggle: () => toggle(goal),
                  })
                )}
              </div>
            </div>
          )
        })}
      </section>

      {lockedTiers.length > 0 && (
        <section style={{ marginBottom: spacing[4] }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: spacing[3],
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.01em',
              }}
            >
              Unlock with a longer plan
            </h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              Locked
            </span>
          </div>

          {lockedTiers.map((tier) => {
            const meta = PLAN_GOAL_TIER_META[tier]
            return (
              <div key={tier} style={{ marginBottom: spacing[4] }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: meta.accent,
                        flexShrink: 0,
                      }}
                    />
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        color: colors.textSecondary,
                      }}
                    >
                      {meta.title}
                      <span style={{ fontWeight: 500, color: colors.textMuted }}>
                        {' '}
                        · {meta.shortLabel}
                      </span>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PLAN_GOALS_BY_TIER[tier].map((goal) =>
                    renderGoalChip({
                      goal,
                      selected: false,
                      locked: true,
                      blockedByMax: false,
                      onToggle: () => toggle(goal),
                    })
                  )}
                </div>
              </div>
            )
          })}
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
      aria-disabled={locked || blockedByMax}
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
        border: `1px solid rgba(245, 158, 11, 0.28)`,
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
        Upgrade to unlock “{goal.label}”
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: colors.textSecondary }}>
        This goal is part of the {requiredMeta.title} plan ({requiredMeta.shortLabel}). Your current{' '}
        {currentMeta.title} plan already includes all shorter-plan goals — upgrade to add this one.
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
