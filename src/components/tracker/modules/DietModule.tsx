'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CompletionToggle,
  ExpandableRow,
  MacroChip,
  ProgressBar,
} from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { suggestedWorkoutDayKey } from '@/lib/daily-tracker/parser'
import type { TrackerCompletion, TrackerMealItem } from '@/lib/daily-tracker/types'

type DietDayOption = { key: string; label: string }

type Props = {
  meals: TrackerMealItem[]
  dietDays?: DietDayOption[]
  completion: TrackerCompletion
  dietScore: number
  saving: boolean
  logDate: string
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

function deriveDietDays(meals: TrackerMealItem[], explicit?: DietDayOption[]): DietDayOption[] {
  if (explicit && explicit.length > 0) return explicit
  const map = new Map<string, string>()
  for (const meal of meals) {
    if (meal.dietDay) map.set(meal.dietDay, meal.dietDayLabel ?? meal.dietDay)
  }
  return Array.from(map.entries()).map(([key, label]) => ({ key, label }))
}

export function DietModule({ meals, dietDays, completion, dietScore, saving, logDate, onPatch }: Props) {
  const days = useMemo(() => deriveDietDays(meals, dietDays), [meals, dietDays])
  const multiDay = days.length > 1
  const selectedKey = completion.selectedDietDay ?? null
  const selectedDay = days.find((d) => d.key === selectedKey) ?? null
  const suggestion = suggestedWorkoutDayKey(days, logDate)
  const autoSelectedRef = useRef(false)
  /** When true, skip auto-suggest and show the day picker (Change day). */
  const [manualDayPick, setManualDayPick] = useState(false)

  const selectDietDay = useCallback(
    (key: string | null) => {
      if (key === null) {
        setManualDayPick(true)
        autoSelectedRef.current = true
      } else {
        setManualDayPick(false)
      }
      void onPatch({ selectedDietDay: key })
    },
    [onPatch]
  )

  useEffect(() => {
    if (!multiDay || selectedKey || !suggestion || saving || manualDayPick || autoSelectedRef.current) {
      return
    }
    autoSelectedRef.current = true
    selectDietDay(suggestion)
  }, [multiDay, selectedKey, suggestion, saving, manualDayPick, selectDietDay])

  const visibleMeals = useMemo(() => {
    if (!multiDay) return meals
    if (!selectedKey) return []
    return meals.filter((m) => m.dietDay === selectedKey)
  }, [meals, multiDay, selectedKey])

  const [expanded, setExpanded] = useState<string | null>(null)
  const done = visibleMeals.filter((m) => completion.meals?.[m.id]?.completed).length

  if (multiDay && !selectedKey) {
    const showPicker = manualDayPick || !suggestion
    return (
      <div>
        <div
          style={{
            padding: spacing[4],
            borderRadius: radius.lg,
            background: colors.bgGlass,
            border: `1px solid ${colors.borderSubtle}`,
            marginBottom: spacing[4],
          }}
        >
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
            Diet day
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {showPicker ? "Which day's diet are you following?" : "Loading today's diet…"}
          </h2>
          {showPicker && (
            <p style={{ margin: '10px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
              Your plan has different meals for different days. Pick today&apos;s schedule and we&apos;ll show those
              meals.
            </p>
          )}
        </div>

        {showPicker && (
        <div style={{ display: 'grid', gap: 10 }}>
          {days.map((day) => {
            const isSuggested = day.key === suggestion
            return (
              <button
                key={day.key}
                type="button"
                disabled={saving}
                onClick={() => selectDietDay(day.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '16px 18px',
                  borderRadius: radius.lg,
                  border: `1px solid ${isSuggested ? colors.accentMuted : colors.borderSubtle}`,
                  background: isSuggested ? colors.accentMuted : colors.bgGlass,
                  color: colors.textPrimary,
                  cursor: saving ? 'wait' : 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 750 }}>{day.label}</span>
                {isSuggested && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>Today</span>
                )}
              </button>
            )
          })}
        </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {multiDay && selectedDay && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: spacing[4],
            padding: '12px 14px',
            borderRadius: radius.md,
            background: colors.bgElevated,
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>Following</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedDay.label} diet</div>
          </div>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => selectDietDay(null)}
          >
            Change day
          </Button>
        </div>
      )}

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: colors.textMuted, fontSize: 14 }}>
            {done} / {visibleMeals.length} meals
          </span>
          <span style={{ fontWeight: 800, color: colors.accent }}>{dietScore}%</span>
        </div>
        <ProgressBar percent={dietScore} height={10} />
      </div>

      {visibleMeals.map((meal) => {
        const mealDone = Boolean(completion.meals?.[meal.id]?.completed)
        const isOpen = expanded === meal.id
        const macros = meal.macros

        return (
          <ExpandableRow
            key={meal.id}
            title={meal.title}
            subtitle={
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {meal.mealTime && <span>{meal.mealTime}</span>}
                {macros?.calories != null && <span>{macros.calories} kcal</span>}
                {macros?.protein != null && <span>P {macros.protein}g</span>}
              </span>
            }
            expanded={isOpen}
            completed={mealDone}
            onToggle={() => setExpanded(isOpen ? null : meal.id)}
            right={
              <CompletionToggle
                completed={mealDone}
                disabled={saving}
                label={`Complete ${meal.title}`}
                onToggle={() =>
                  void onPatch({
                    meals: {
                      [meal.id]: { completed: !mealDone, notes: completion.meals?.[meal.id]?.notes },
                    },
                  })
                }
              />
            }
          >
            <div style={{ paddingTop: spacing[3] }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: spacing[3] }}>
                <MacroChip label="Cal" value={macros?.calories} />
                <MacroChip label="Protein" value={macros?.protein} unit="g" />
                <MacroChip label="Carbs" value={macros?.carbs} unit="g" />
                <MacroChip label="Fat" value={macros?.fat} unit="g" />
              </div>

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
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: colors.bgCard,
                    marginBottom: 8,
                    fontSize: 15,
                    lineHeight: 1.5,
                  }}
                >
                  {food}
                </div>
              ))}

              {meal.notes && (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textSecondary }}>
                  <strong>Notes:</strong> {meal.notes}
                </p>
              )}

              <Button
                fullWidth
                variant={mealDone ? 'secondary' : 'primary'}
                success={mealDone}
                disabled={saving}
                onClick={() =>
                  void onPatch({
                    meals: {
                      [meal.id]: { completed: !mealDone, notes: completion.meals?.[meal.id]?.notes },
                    },
                  })
                }
              >
                {mealDone ? 'Meal Completed' : 'Complete Meal'}
              </Button>
            </div>
          </ExpandableRow>
        )
      })}
    </div>
  )
}
