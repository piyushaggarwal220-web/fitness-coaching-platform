'use client'

import type { Plan } from '@/types/database'
import { colors } from '@/lib/design-tokens'
import { comparePlanSections, mergeNutritionHighlights } from '@/lib/plan-compare'
import { clientCoachNotes } from '@/lib/plan-metadata'
import { aiActionStyles as s } from './styles'

type PlanCompareDrawerProps = {
  planA: Plan | null
  planB: Plan | null
  labelA?: string
  labelB?: string
  onClose: () => void
}

function CompareBlock({
  label,
  leftLines,
  rightLines,
  changed,
}: {
  label: string
  leftLines: { text: string; changed: boolean }[]
  rightLines: { text: string; changed: boolean }[]
  changed: boolean
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14, color: colors.textPrimary }}>{label}</h4>
        {changed && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: colors.accent,
            backgroundColor: colors.accentMuted,
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            Changed
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexDirection: 'row' }}>
        <div style={s.compareCol}>
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Current Plan</div>
          <pre style={s.comparePre}>
            {leftLines.map((line, i) => (
              <span
                key={i}
                style={{
                  display: 'block',
                  backgroundColor: line.changed ? 'rgba(249,115,22,0.08)' : 'transparent',
                }}
              >
                {line.text || ' '}
              </span>
            ))}
          </pre>
        </div>
        <div style={s.compareCol}>
          <div style={{ fontSize: 11, color: colors.accent, marginBottom: 4 }}>AI Draft</div>
          <pre style={s.comparePre}>
            {rightLines.map((line, i) => (
              <span
                key={i}
                style={{
                  display: 'block',
                  backgroundColor: line.changed ? 'rgba(249,115,22,0.14)' : 'transparent',
                }}
              >
                {line.text || ' '}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}

export function PlanCompareDrawer({
  planA,
  planB,
  labelA = 'Current Plan',
  labelB = 'AI Draft',
  onClose,
}: PlanCompareDrawerProps) {
  if (!planA || !planB) return null

  const normalizedA = {
    ...planA,
    coach_notes: clientCoachNotes(planA.coach_notes),
  }
  const normalizedB = {
    ...planB,
    coach_notes: clientCoachNotes(planB.coach_notes),
  }

  const sections = comparePlanSections(normalizedA, normalizedB)
  const nutritionHighlights = mergeNutritionHighlights(
    normalizedA.nutrition_plan,
    normalizedB.nutrition_plan,
  )

  return (
    <div className="motion-bottom-sheet-overlay" style={s.drawerOverlay} onClick={onClose} role="presentation">
      <div className="motion-bottom-sheet-panel" style={s.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare plan versions">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: colors.textPrimary }}>
            {labelA} ← {labelB}
          </h3>
          <button type="button" style={s.linkBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textMuted }}>
          v{planA.version} current · v{planB.version} draft — differences highlighted in orange
        </p>
        {nutritionHighlights.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
          }}>
            {nutritionHighlights.map((item, index) => (
              <span key={`nutrition-${index}`} style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: colors.accentMuted,
                color: colors.accent,
                fontWeight: 600,
              }}>
                {item}
              </span>
            ))}
          </div>
        )}
        {sections.map((section) => (
          <CompareBlock key={section.label} {...section} />
        ))}
      </div>
    </div>
  )
}
