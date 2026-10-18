/** Newest Smart Coach rows returned to the thread. Older rows stay stored. */
export const AI_COACH_VISIBLE_MESSAGES = 500

/**
 * The history query returns newest-first. The thread must show that window
 * oldest-to-newest. Taking the first page of an oldest-first query hides
 * every message after the cap, so a long chat looks deleted on reload.
 */
export function chronologicalChatWindow<T>(
  rowsNewestFirst: readonly T[],
  limit = AI_COACH_VISIBLE_MESSAGES
): T[] {
  return [...rowsNewestFirst.slice(0, limit)].reverse()
}
