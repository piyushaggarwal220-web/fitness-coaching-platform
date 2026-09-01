/**
 * Guards so client-facing plan prose does not invent coaching-week handoffs
 * or "next week" progression when the client only asked for a few edits.
 */

/** Hard rules appended when revising from a client plan-change request. */
export const CLIENT_PLAN_EDIT_WEEK_RULES = [
  'FRAMING: Rewrite the client\'s CURRENT plan applying their request — not a new coaching week.',
  'It is NOT a weekly check-in update, NOT a new coaching week, and NOT a "next week" program redesign.',
  'Keep the same overall plan phase unless the request requires otherwise.',
  'NEVER write week-handoff or next-week language: "Welcome to week 2", "Week 2 update", "for next week", "this coming week we will", "now that week 1 is done", "moving into week 2", etc.',
  'NEVER invent a progressive weekly arc ("this week we focus on X, next we will…") unless the client explicitly asked for that.',
].join(' ')

/** Coach or AI rewrite: output a clean plan with zero edit meta. */
export const FRESH_PLAN_OUTPUT_RULES = [
  'FRESH PLAN OUTPUT (non-negotiable):',
  'Rewrite the COMPLETE section from scratch. The current plan is background context only (foods, exercises, schedule they already use) — do NOT patch the old text in place.',
  'The output must read like a brand-new plan the client is receiving for the first time.',
  'NEVER mention: edits, updates, changes, revisions, increases, decreases, raised, lowered, swapped, adjusted, bumped, "I updated", "I increased", "I raised", "as you asked", "as requested", "per your request", "what changed", "from last week", "keeping the same as before", "instead of the old plan".',
  'Do NOT write a meta opener explaining what you changed. Start directly with plan content: diet → optional brief goal-led intro with NO change language, then Day 1 (Monday) through Day 7; workout → Day 1 (Monday) training structure.',
  'Goal-focused encouragement is fine only when it contains zero reference to updating/changing the plan.',
].join('\n')

/** Coach diet edit: modify the existing plan — do not redesign unrelated meals. */
export const DIET_MODIFY_PLAN_RULES = [
  'DIET MODIFY (non-negotiable — default for coach diet edits):',
  'The CURRENT PLAN below is the client\'s active diet. MODIFY it — do not invent a completely different week of meals.',
  'Keep the same foods, meal names, timings, portions, and structure for every day and meal the coach did NOT ask to change.',
  'When the coach names specific swaps, days, or portions, change ONLY those items and rebalance macros on affected meals/days as needed.',
  'Unchanged days should read almost the same as the current plan (same dishes and wording). Still output all 7 days in full for the tracker — copy unchanged days verbatim where possible.',
  'Keep the same daily calorie average (within about 75 kcal) unless the coach explicitly asks to raise, lower, or recalculate calories.',
  'Always fix diet preference, allergy, and dislike violations from Hard Constraints everywhere — even if the coach did not mention them.',
  'Respect the client\'s lifestyle from onboarding and the current plan — meal times, favorite foods, cooking ability, work schedule, budget — never swap in a random generic chart.',
  'Do NOT add a goal roadmap paragraph on modify edits.',
  'NEVER mention edits, updates, or what changed in client-facing text. Output reads like the normal plan the client already follows.',
].join('\n')

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

const PLAN_EDIT_META =
  /\b(raised|increased|decreased|lowered|updated|changed|adjusted|bumped|revised|modified|swap(?:ped|ping)?|as (?:you )?asked|as requested|per your request|what changed|from last week|keeping (?:the )?same|instead of (?:the )?old|i'?ve (?:raised|increased|decreased|updated|changed|adjusted)|i (?:raised|increased|decreased|updated|changed|adjusted)|this week i'?m giving you|giving you about \d+ calories|moved (?:you )?to|taken you to)\b/i

const PLAN_BODY_ANCHOR =
  /^(?:calories:\s*\d|day\s+1\s*\(|weekly diet plan|warm-up:|main workout:)/i

/**
 * Strip coach/AI meta commentary about edits ("I've raised your calories…") from plan prose.
 * Keeps the structural plan body intact.
 */
export function stripPlanEditMetaLanguage(text: string): string {
  if (!text?.trim()) return text ?? ''

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let start = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) continue
    if (PLAN_BODY_ANCHOR.test(line)) break
    if (PLAN_EDIT_META.test(line)) {
      start = i + 1
      continue
    }
    break
  }

  let out = lines.slice(start).join('\n')

  // Trim edit-meta clauses from "Weekly Diet Plan:" opener sentences
  out = out.replace(
    /(Weekly Diet Plan:\s*)([^.\n]{0,240}?(?:raised|increased|updated|changed|adjusted|giving you about \d+ calories|moved you to)[^.?\n]*[.?!]?\s*)/gi,
    '$1'
  )

  return out.replace(/\n{3,}/g, '\n\n').trim()
}
