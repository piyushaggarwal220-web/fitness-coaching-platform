import type {
  TrackerCategoryScores,
  TrackerCompletion,
  TrackerSnapshot,
  TrackerSnapshotItem,
} from './types'

function pct(completed: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((completed / total) * 100)
}

export function calculateTrackerScores(
  snapshot: TrackerSnapshot,
  completion: TrackerCompletion
): { scores: TrackerCategoryScores; overall: number } {
  const meals = snapshot.items.filter((i) => i.type === 'meal')
  const mealDone = meals.filter((m) => completion.meals?.[m.id]?.completed).length
  const diet = pct(mealDone, meals.length)

  const workout = snapshot.items.find((i) => i.type === 'workout')
  let workoutScore = 100
  if (workout && workout.type === 'workout') {
    const total = workout.exercises.length
    const done = workout.exercises.filter((ex) => completion.exercises?.[ex.id]?.completed).length
    workoutScore = pct(done, total)
  }

  const waterItem = snapshot.items.find((i) => i.type === 'water')
  let waterScore = 100
  if (waterItem && waterItem.type === 'water') {
    const ml = completion.water?.ml ?? 0
    waterScore = Math.min(100, pct(ml, waterItem.targetMl))
  }

  const supps = snapshot.items.filter((i) => i.type === 'supplement')
  const suppDone = supps.filter((s) => completion.supplements?.[s.id]?.completed).length
  const supplements = pct(suppDone, supps.length)

  const cardioItems = snapshot.items.filter((i) => i.type === 'cardio')
  let cardio = 100
  if (cardioItems.length > 0) {
    let sum = 0
    for (const item of cardioItems) {
      const target = Number(item.target) || 1
      const actual = completion.cardio?.[item.id]?.actual ?? 0
      sum += Math.min(100, pct(actual, target))
    }
    cardio = Math.round(sum / cardioItems.length)
  }

  const sleepItem = snapshot.items.find((i) => i.type === 'sleep')
  let sleep = 100
  if (sleepItem && sleepItem.type === 'sleep') {
    const hours = completion.sleep?.hours
    const quality = completion.sleep?.quality
    if (hours != null && sleepItem.targetHours) {
      sleep = Math.min(100, pct(hours, sleepItem.targetHours))
    } else if (quality != null) {
      sleep = Math.round((quality / 10) * 100)
    } else if (!completion.sleep?.bedtime) {
      sleep = 0
    }
  }

  const categories: TrackerCategoryScores = {
    diet,
    workout: workoutScore,
    water: waterScore,
    supplements,
    cardio,
    sleep,
  }

  const weights: { key: keyof TrackerCategoryScores; weight: number }[] = [
    { key: 'diet', weight: meals.length > 0 ? 1 : 0 },
    { key: 'workout', weight: workout ? 1 : 0 },
    { key: 'water', weight: waterItem ? 1 : 0 },
    { key: 'supplements', weight: supps.length > 0 ? 1 : 0 },
    { key: 'cardio', weight: cardioItems.length > 0 ? 1 : 0 },
    { key: 'sleep', weight: sleepItem ? 1 : 0 },
  ]

  const active = weights.filter((w) => w.weight > 0)
  const totalWeight = active.reduce((s, w) => s + w.weight, 0)
  const overall =
    totalWeight === 0
      ? 0
      : Math.round(active.reduce((s, w) => s + categories[w.key] * w.weight, 0) / totalWeight)

  return { scores: categories, overall }
}

export function getTimelineProgress(snapshot: TrackerSnapshot, completion: TrackerCompletion): number {
  const trackable = snapshot.items.filter((i) => i.type !== 'note')
  if (trackable.length === 0) return 0

  let done = 0
  for (const item of trackable) {
    if (isItemComplete(item, completion)) done++
  }
  return pct(done, trackable.length)
}

export function isItemComplete(item: TrackerSnapshotItem, completion: TrackerCompletion): boolean {
  switch (item.type) {
    case 'meal':
      return Boolean(completion.meals?.[item.id]?.completed)
    case 'workout':
      return item.exercises.every((ex) => completion.exercises?.[ex.id]?.completed)
    case 'cardio':
      return Boolean(completion.cardio?.[item.id]?.completed)
    case 'supplement':
      return Boolean(completion.supplements?.[item.id]?.completed)
    case 'water':
      return (completion.water?.ml ?? 0) >= item.targetMl * 0.8
    case 'sleep':
      return Boolean(completion.sleep?.hours || completion.sleep?.quality)
    case 'note':
      return true
    default:
      return false
  }
}

export function averageRpe(completion: TrackerCompletion): number | null {
  const rpes: number[] = []
  for (const ex of Object.values(completion.exercises ?? {})) {
    for (const set of ex.sets ?? []) {
      if (set.rpe != null) rpes.push(set.rpe)
    }
  }
  if (rpes.length === 0) return null
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
}
