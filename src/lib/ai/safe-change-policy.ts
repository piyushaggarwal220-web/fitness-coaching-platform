/**
 * Safety guardrail: clients sometimes ask for extreme, unsafe changes ("bulk fast, add a lot of
 * calories" or "drop weight fast, slash my calories"). The coach/AI must NOT comply blindly.
 * Apply a safe version of the intent and explain why, instead of an aggressive crash change.
 *
 * Product philosophy: increase expenditure (steps, training, cardio) before reducing calories.
 */
export const SAFE_RATE_OF_CHANGE_RULE = [
  'SAFE RATE OF CHANGE:',
  '- EXPENDITURE FIRST: when the client wants faster fat loss or says they are not losing, raise steps/training/cardio BEFORE cutting food. Do not slash calories as the first lever.',
  '- The daily target is the computed Mifflin number in CALORIE METHOD, or the calorie target the client set on their profile. Do not replace that number with a floor or a cap.',
  '- Weight GAIN / bulking: if they did not set their own calorie target, use the CALORIE METHOD surplus. Do not invent a larger surplus.',
  '- Fat LOSS / cutting: if they did not set their own calorie target, use the CALORIE METHOD deficit. Do not slash below that number.',
  '- Plateau / "not losing": hold or slightly raise calories and increase daily steps or training density within their schedule — never respond with a big calorie cut.',
  '- Do not substitute 1800, 2000, or any other floor for the computed target.',
  '- Acknowledge the client\'s goal warmly, apply the safe version of what they asked, and briefly say why you are not going more extreme. Stay on solid ground.',
].join('\n')
