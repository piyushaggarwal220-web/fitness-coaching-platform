import { PIYUSH_COACH_ID } from '@/lib/coach-delivery-policy'

export type CoachServiceMode = 'human' | 'ai'

export type CoachServiceProfile = {
  coach_service?: string | null
  coach_id?: string | null
}

export const PIYUSH_NO_CHAT_MESSAGE =
  'Your coaching is through your plan and check-ins. This plan does not include coach chat.'

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

/** Piyush clients get automated plans and check-ins only — no Smart Coach or Piyush chat. */
export function clientHasCoachChat(profile: CoachServiceProfile | null | undefined): boolean {
  return profile?.coach_id !== PIYUSH_COACH_ID
}

export function coachIdHasClientChat(coachId: string | null | undefined): boolean {
  return coachId !== PIYUSH_COACH_ID
}
