'use client'

import { useState } from 'react'
import {
  CompletionToggle,
  ExpandableRow,
  MacroChip,
  ProgressBar,
} from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion, TrackerMealItem } from '@/lib/daily-tracker/types'

type Props = {
  meals: TrackerMealItem[]
  completion: TrackerCompletion
  dietScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function DietTrackerSection({ meals, completion, dietScore, saving, onPatch }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (meals.length === 0) return null

  const completedCount = meals.filter((m) => completion.meals?.[m.id]?.completed).length

  return (
    <div style={{ paddingTop: spacing[3] }}>
      <div style={{ marginBottom: spacing[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <span style={{ color: colors.textMuted }}>Diet progress</span>
          <span style={{ fontWeight: 700, color: colors.accent }}>{dietScore}%</span>
        </div>
        <ProgressBar percent={dietScore} height={10} />
      </div>

      {meals.map((meal) => {
        const mealDone = Boolean(completion.meals?.[meal.id]?.completed)
        const isOpen = expanded === meal.id
        const macros = meal.macros
        const subtitle = (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {macros?.calories != null && <span>{macros.calories} kcal</span>}
            {macros?.protein != null && <span>P {macros.protein}g</span>}
            {meal.mealTime && <span>{meal.mealTime}</span>}
          </div>
        )

        return (
          <ExpandableRow
            key={meal.id}
            title={meal.title}
            subtitle={subtitle}
            expanded={isOpen}
            completed={mealDone}
            onToggle={() => setExpanded(isOpen ? null : meal.id)}
            right={
              <CompletionToggle
                completed={mealDone}
                disabled={saving}
                label={`Mark ${meal.title} complete`}
                onToggle={() =>
                  void onPatch({
                    meals: {
                      [meal.id]: {
                        completed: !mealDone,
                        notes: completion.meals?.[meal.id]?.notes,
                      },
                    },
                  })
                }
              />
            }
          >
            <div style={{ paddingTop: spacing[3] }}>
              {(macros?.calories != null ||
                macros?.protein != null ||
                macros?.carbs != null ||
                macros?.fat != null) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: spacing[3] }}>
                  <MacroChip label="Cal" value={macros?.calories} />
                  <MacroChip label="Protein" value={macros?.protein} unit="g" />
                  <MacroChip label="Carbs" value={macros?.carbs} unit="g" />
                  <MacroChip label="Fat" value={macros?.fat} unit="g" />
                </div>
              )}

              <div style={{ marginBottom: spacing[2] }}>
                <div
                  style={{
                    fontSize: 11,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 8,
                  }}
                >
                  Foods
                </div>
                {(meal.foodItems ?? [meal.foods]).map((food, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: colors.bgCard,
                      marginBottom: 6,
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {food}
                  </div>
                ))}
              </div>

              {meal.mealTimer && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: colors.accentMuted,
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: spacing[2],
                  }}
                >
                  ⏱ {meal.mealTimer}
                </div>
              )}

              {meal.notes && (
                <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
                  <strong>Notes:</strong> {meal.notes}
                </p>
              )}
            </div>
          </ExpandableRow>
        )
      })}
    </div>
  )
}
