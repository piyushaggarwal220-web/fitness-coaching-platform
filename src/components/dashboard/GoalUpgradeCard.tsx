'use client'

import { ArrowUpRight, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import {
  GOAL_BODY_TYPE_META,
  PLAN_GOAL_TIER_META,
  formatPlanGoalLabel,
  getLockedGoals,
  isValidGoalBodyType,
  planDisplayName,
  resolveGoalPlanTier,
  suggestedUpgradeTier,
  upgradeHrefForTier,
  type GoalBodyType,
} from '@/lib/plan-goals'

type Props = {
  planSlug: string | null | undefined
  accessSource?: string | null
  gender?: string | null
  bodyType?: string | null
}

/** Homepage CTA when higher-plan goals are locked for this client. */
export function GoalUpgradeCard({ planSlug, accessSource, gender, bodyType }: Props) {
  const router = useRouter()
  const currentTier = resolveGoalPlanTier(planSlug, { accessSource })
  const resolvedBodyType: GoalBodyType | null = isValidGoalBodyType(bodyType) ? bodyType : null
  const upgradeTier = suggestedUpgradeTier(currentTier, {
    gender,
    bodyType: resolvedBodyType,
  })

  if (!upgradeTier) return null

  const locked = getLockedGoals(currentTier, gender, resolvedBodyType)
    .filter((goal) => goal.tier === upgradeTier)
    .slice(0, 4)

  if (locked.length === 0) return null

  const meta = PLAN_GOAL_TIER_META[upgradeTier]
  const bodyLabel = resolvedBodyType ? GOAL_BODY_TYPE_META[resolvedBodyType].title : null

  return (
    <Card
      variant="glass"
      style={{
        marginBottom: spacing[4],
        border: '1px solid rgba(249,115,22,0.28)',
        background:
          'linear-gradient(145deg, rgba(249,115,22,0.14) 0%, rgba(17,24,39,0.96) 48%, rgba(9,9,11,0.99) 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.accentMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Lock size={20} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            Unlock more goals
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Upgrade to {meta.title}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
            You’re on {planDisplayName(currentTier)}
            {bodyLabel ? ` · ${bodyLabel}` : ''}. These goals stay locked until you upgrade:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {locked.map((goal) => (
              <span
                key={goal.value}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 10px',
                  borderRadius: 999,
                  border: `1px dashed ${colors.borderSubtle}`,
                  background: colors.bgElevated,
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Lock size={11} />
                {formatPlanGoalLabel(goal.value)}
              </span>
            ))}
          </div>
          <Button
            fullWidth
            style={{ marginTop: 14 }}
            onClick={() => router.push(upgradeHrefForTier(upgradeTier))}
          >
            Upgrade to {meta.title}
            <ArrowUpRight size={16} style={{ marginLeft: 6 }} />
          </Button>
        </div>
      </div>
    </Card>
  )
}
