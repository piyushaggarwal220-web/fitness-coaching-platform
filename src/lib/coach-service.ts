export type CoachServiceMode = 'human' | 'ai'

export type CoachServiceProfile = {
  coach_service?: string | null
  coach_id?: string | null
}

/** Legacy: null + assigned coach → human. New claims write 'ai' explicitly. */
export function resolveCoachService(
  profile: CoachServiceProfile | null | undefined
): CoachServiceMode {
  if (profile?.coach_service === 'human') return 'human'
  if (profile?.coach_service === 'ai') return 'ai'
  if (profile?.coach_id) return 'human'
  return 'ai'
}

export function usesAiCoach(profile: CoachServiceProfile | null | undefined): boolean {
  return resolveCoachService(profile) === 'ai'
}

export function usesHumanCoach(profile: CoachServiceProfile | null | undefined): boolean {
  return resolveCoachService(profile) === 'human'
}
