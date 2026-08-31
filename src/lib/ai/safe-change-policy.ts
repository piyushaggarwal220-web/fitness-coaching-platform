import { DIET_FLOOR_BASE_KCAL } from '@/lib/ai/plan-quality-rules'

/**
 * Safety guardrail: clients sometimes ask for extreme, unsafe changes ("bulk fast, add a lot of
 * calories" or "drop weight fast, slash my calories"). The coach/AI must NOT comply blindly.
 * Apply a safe version of the intent and explain why, instead of an aggressive crash change.
 *
 * Product philosophy: increase expenditure (steps, training, cardio) before reducing calories.
 */
export const SAFE_RATE_OF_CHANGE_RULE = [
  'SAFE RATE OF CHANGE (overrides client demands AND any calorie band above — never break this, even if the client insists):',
  '- EXPENDITURE FIRST: when the client wants faster fat loss or says they are not losing, raise steps/training/cardio BEFORE cutting food. Do not slash calories as the first lever.',
  '- HARD CAP: the daily calorie gap from maintenance must never exceed 400 kcal in EITHER direction. Maximum 400 kcal deficit for fat loss. Maximum 400 kcal surplus for weight gain. There is no exception for motivated clients, deadlines, or events.',
  '- Weight GAIN / bulking: if the client asks to "gain fast", "bulk hard", or "add a lot of calories", do NOT spike calories. Stay at or below a 400 kcal surplus and explain that faster gain is mostly fat, and steady gain is what lasts.',
  '- Fat LOSS / cutting: if the client asks to "lose fast", "crash", or "cut calories hard", do NOT slash calories. Prefer higher steps/training with a mild deficit (about 150 to 250 kcal below maintenance at high flux). Explain that output + moderate intake protects muscle, energy, and results.',
  '- Plateau / "not losing": hold or slightly raise calories and increase daily steps or training density within their schedule — never respond with a big calorie cut.',
  `- Never program below ${DIET_FLOOR_BASE_KCAL} kcal/day. If a lower intake seems indicated, still write ${DIET_FLOOR_BASE_KCAL}+ and flag the coach in coach_notes.`,
  '- Do not make large week-to-week calorie jumps downward. From an established plan (e.g. ~2100 kcal), trim at most about 150 to 200 kcal at a time — and only after output has already been raised.',
  '- Acknowledge the client\'s goal warmly, apply the safe version of what they asked, and briefly say why you are not going more extreme. Stay on solid ground.',
].join('\n')
