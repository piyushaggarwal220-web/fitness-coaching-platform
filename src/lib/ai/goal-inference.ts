import type { OnboardingFormData } from '@/types/database'

export type InferredGoal = 'fat_loss' | 'muscle_gain' | 'recomposition' | 'strength' | 'athletic_performance'

export type GoalInferenceResult = {
  goal: InferredGoal
  reasoning: string[]
}

/** Infer the most appropriate fitness goal when the client selected "help me decide". */
export function inferFitnessGoal(form: OnboardingFormData): GoalInferenceResult {
  const reasoning: string[] = []
  const weight = Number(form.weight)
  const height = Number(form.height)
  const bmi = weight > 0 && height > 0 ? weight / ((height / 100) ** 2) : null
  const struggle = form.biggest_struggle.split('|')[0] ?? ''
  const experience = form.training_experience

  if (bmi != null) {
    if (bmi >= 27) {
      reasoning.push(`BMI ${bmi.toFixed(1)} suggests prioritising fat loss.`)
      if (struggle === 'nutrition' || struggle === 'consistency') {
        return { goal: 'fat_loss', reasoning }
      }
    }
    if (bmi < 20 && experience === 'beginner') {
      reasoning.push(`Lower BMI (${bmi.toFixed(1)}) with beginner training suggests muscle gain focus.`)
      return { goal: 'muscle_gain', reasoning }
    }
    if (bmi >= 22 && bmi < 27) {
      reasoning.push(`BMI ${bmi.toFixed(1)} in recomposition range.`)
      return { goal: 'recomposition', reasoning }
    }
  }

  if (struggle === 'injury' || form.injuries.trim()) {
    reasoning.push('Injury or pain history — strength and controlled progression recommended.')
    return { goal: 'strength', reasoning }
  }

  if (struggle === 'motivation' && experience === 'advanced') {
    reasoning.push('Advanced trainee seeking motivation — athletic performance framing may help adherence.')
    return { goal: 'athletic_performance', reasoning }
  }

  if (experience === 'beginner') {
    reasoning.push('Beginner profile — fat loss is a common effective starting goal.')
    return { goal: 'fat_loss', reasoning }
  }

  if (experience === 'advanced') {
    reasoning.push('Advanced training history — recomposition suits experienced trainees.')
    return { goal: 'recomposition', reasoning }
  }

  reasoning.push('Balanced profile — defaulting to recomposition.')
  return { goal: 'recomposition', reasoning }
}

export function isAiSelectedGoal(
  data: { goals?: { aiSelectedGoal?: boolean; goalSelectionMethod?: string } } | null | undefined
): boolean {
  return data?.goals?.aiSelectedGoal === true || data?.goals?.goalSelectionMethod === 'ai'
}
