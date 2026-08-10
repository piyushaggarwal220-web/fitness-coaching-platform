/**
 * Guards so client-facing plan prose does not invent coaching-week handoffs
 * or "next week" progression when the client only asked for a few edits.
 */

/** Hard rules appended when revising from a client plan-change request. */
export const CLIENT_PLAN_EDIT_WEEK_RULES = [
  'FRAMING: This is an in-place CLIENT EDIT of the CURRENT active plan.',
  'It is NOT a weekly check-in update, NOT a new coaching week, and NOT a "next week" program redesign.',
  'Keep the same overall plan phase. Apply ONLY the requested changes (foods, portions, exercises, volume, schedule).',
  'Preserve days, structure, and everything the client did not ask to change.',
  'NEVER write week-handoff or next-week language: "Welcome to week 2", "Week 2 update", "for next week", "this coming week we will", "now that week 1 is done", "moving into week 2", etc.',
  'NEVER invent a progressive weekly arc ("this week we focus on X, next we will…") unless the client explicitly asked for that.',
  'Open with a short note of what you changed for their request — then the revised plan. No new-week greeting.',
].join(' ')

/** Shared rule for all diet/workout generation that may land in the client plan. */
export const NEVER_MENTION_COACHING_WEEK_RULE =
  'Never mention coaching week numbers, "Welcome to week N", or "next week\'s plan" in client-facing diet/workout prose. Mesocycle week labels are internal coaching context only.'

/**
 * Remove invented week-handoff / next-week progression openers from plan prose.
 * Keeps the rest of the plan intact.
 */
export function stripClientWeekHandoffLanguage(text: string): string {
  if (!text?.trim()) return text ?? ''

  let out = text.replace(/\r\n/g, '\n')

  // Whole-line greetings / titles
  out = out.replace(
    /^\s*(?:\*{0,2}|#{1,3}\s*)?(?:welcome to|entering|starting|here(?:'|’)s|here is)\s+(?:your\s+)?week\s+\d+[^\n]*$/gim,
    ''
  )
  out = out.replace(
    /^\s*(?:\*{0,2}|#{1,3}\s*)?week\s+\d+\s+(?:update|updated plan|plan|diet|workout)[^\n]*$/gim,
    ''
  )
  out = out.replace(
    /^\s*(?:\*{0,2}|#{1,3}\s*)?(?:moving into|now (?:onto|into)|on to)\s+week\s+\d+[^\n]*$/gim,
    ''
  )

  // In-sentence welcome / handoff phrases
  out = out.replace(
    /\bwelcome to (?:your )?week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /\b(?:entering|starting|beginning|moving into)\s+week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /\bhere(?:'|’)s your week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /\bnow that week\s+\d+\s+is (?:done|over|complete)\b[^.!?\n]*[.!?]?/gi,
    ''
  )

  // "for next week" / "this coming week" framing
  out = out.replace(
    /^\s*(?:here(?:'|’)s|here is)\s+(?:an?\s+)?(?:updated\s+)?(?:diet|meal|workout)?\s*plan\s+for\s+(?:next|the coming)\s+week[^\n]*$/gim,
    ''
  )
  out = out.replace(
    /\b(?:for|into)\s+(?:next|the coming)\s+week\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /^\s*this (?:coming )?week we (?:will|are going to|focus)[^\n]*$/gim,
    ''
  )

  return out.replace(/\n{3,}/g, '\n\n').trim()
}
