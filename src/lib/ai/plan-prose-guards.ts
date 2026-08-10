/**
 * Guards so client-facing plan prose does not invent coaching-week handoffs
 * (e.g. "Welcome to week 2" on a day-1 client edit).
 */

/** Hard rules appended when regenerating from a client plan-change request. */
export const CLIENT_PLAN_EDIT_WEEK_RULES = [
  'FRAMING: This is an in-place CLIENT EDIT of the active plan, NOT a weekly check-in handoff and NOT the start of a new coaching week.',
  'NEVER write welcome-to-week language ("Welcome to week 2", "Week 2 update", "entering week 3", "for next week\'s plan", etc.).',
  'NEVER invent or advance a coaching week number in client-facing text. Mesocycle week numbers in the prompt are INTERNAL only.',
  'If the client is on early days / week 1, do not imply they have finished a week.',
  'Open by naming what changed for their request (foods, portions, exercises) — not by greeting a new week.',
].join(' ')

/** Shared rule for all diet/workout generation that may land in the client plan. */
export const NEVER_MENTION_COACHING_WEEK_RULE =
  'Never mention coaching week numbers, "Welcome to week N", or "next week\'s plan" in client-facing diet/workout prose. Mesocycle week labels are internal coaching context only.'

/**
 * Remove invented week-handoff greetings from client-facing plan prose.
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

  // In-sentence welcome / handoff phrases
  out = out.replace(
    /\bwelcome to (?:your )?week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /\b(?:entering|starting|beginning)\s+week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )
  out = out.replace(
    /\bhere(?:'|’)s your week\s+\d+\b[^.!?\n]*[.!?]?/gi,
    ''
  )

  // "for next week" framing often used as a fake handoff opener
  out = out.replace(
    /^\s*(?:here(?:'|’)s|here is)\s+(?:an?\s+)?(?:updated\s+)?(?:diet|meal|workout)?\s*plan\s+for\s+next\s+week[^\n]*$/gim,
    ''
  )

  return out.replace(/\n{3,}/g, '\n\n').trim()
}
