import { mergeCompletion } from '@/lib/daily-tracker/parser'
import type { TrackerCompletion } from '@/lib/daily-tracker/types'

const DRAFT_PREFIX = 'lurvox:tracker-draft:'

export type TrackerDraft = {
  dayId: string
  completion: TrackerCompletion
  updatedAt: string
}

function storageKey(dayId: string): string {
  return `${DRAFT_PREFIX}${dayId}`
}

export function readTrackerDraft(dayId: string): TrackerDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(dayId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TrackerDraft
    if (!parsed?.dayId || parsed.dayId !== dayId || !parsed.completion) return null
    return parsed
  } catch {
    return null
  }
}

export function writeTrackerDraft(dayId: string, completion: TrackerCompletion): void {
  if (typeof window === 'undefined') return
  try {
    const draft: TrackerDraft = {
      dayId,
      completion,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(storageKey(dayId), JSON.stringify(draft))
  } catch {
    // Quota / private mode — ignore; server remains source of truth.
  }
}

export function clearTrackerDraft(dayId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(dayId))
  } catch {
    // ignore
  }
}

/** Merge a local draft onto server completion so unsynced set logs survive remount. */
export function applyTrackerDraft(
  serverCompletion: TrackerCompletion,
  draft: TrackerDraft | null
): TrackerCompletion {
  if (!draft) return serverCompletion
  return mergeCompletion(serverCompletion, draft.completion)
}
