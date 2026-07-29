/** Default coach client capacity used for assignment and dashboard display. */
export const DEFAULT_COACH_HARD_CAP = 1000

export function resolveCoachHardCap(hardCap: number | null | undefined): number {
  if (typeof hardCap === 'number' && Number.isFinite(hardCap) && hardCap > 0) {
    return hardCap
  }
  return DEFAULT_COACH_HARD_CAP
}
