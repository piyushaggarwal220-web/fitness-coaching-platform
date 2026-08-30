/** Bump this when protein/calorie/volume prompt rules change so cached hard-constraints refresh. */
export const PLAN_QUALITY_RULES_VERSION = 'protein-cal-1800-sets-names-sections-v4'

/** Minimum daily calories for generated diets. Do not cut below this to chase protein. */
export const DIET_FLOOR_TARGET_KCAL = 1800
/** Reject (and retry) only when clearly under the floor; ~1% rounding is tolerated. */
export const DIET_FLOOR_HARD_KCAL = 1780

export const DAY_HEADER_PROMPT_RULES = [
  'DAY HEADERS (non-negotiable, diet and workout):',
  '- Label every day as "Day N (Weekday)" with Day 1 = Monday, Day 2 = Tuesday, through Day 7 = Sunday.',
  '- Example: "Day 1 (Monday)", "Day 2 (Tuesday)". Never a bare weekday ("Monday") and never a bare "Day 1" without the weekday in parentheses.',
].join('\n')

export const PROTEIN_CALORIE_PROMPT_RULES = [
  'PROTEIN vs CALORIES (non-negotiable):',
  `- Calories come first so the client can function. Daily average must be at least ${DIET_FLOOR_TARGET_KCAL} kcal.`,
  `- If allowed foods cannot hit a high protein number (veg, few animal-protein days, no whey), LOWER the protein target. Do not cut calories, rice, roti, oil, or snacks to chase grams.`,
  '- Fill remaining calories with carbs and fats the client actually eats so energy stays high.',
  '- Never tell a protein number higher than the food on the plate. Header protein, daily averages, and each (P: Xg) meal line must match the actual portions. Do not inflate protein.',
  '- Each meal has ONE primary option. Daily Total, weekly averages, and header macros count only that primary option (the first option written). If you offer a swap, give the swap its own macro line so the client can compare, but NEVER add primary + swap together.',
  '- Tight budget means cheaper protein foods (dal, eggs if allowed, soya, chana), not a default of 0.5 g/kg.',
  '- If whey is mentioned, that scoop must be inside that meal\'s (P: Xg | C: Yg | F: Zg | ~K kcal) line. If it is not in the macros, do not mention whey.',
  `- If a textbook cut would go below ${DIET_FLOOR_TARGET_KCAL} kcal, still write ${DIET_FLOOR_TARGET_KCAL} or more and put one line in coach_notes: "Held at ${DIET_FLOOR_TARGET_KCAL} kcal floor — please review." That is the exceptional case for the coach.`,
].join('\n')

export const EDIT_CALORIE_PRESERVATION_RULES = [
  'SMALL EDIT CALORIE RULE (when the client did NOT ask to change calories/macros):',
  '- Swap only the requested foods. Keep the same daily calorie average (within ~75 kcal).',
  '- Do not rewrite unrelated days. Do not redesign the week. Do not "rebalance" macros.',
  '- Adjust portion sizes slightly if needed so the daily average stays where it was.',
  '- Header Calories/Protein/Carbs/Fat must still match the meal math.',
].join('\n')

export const WORKOUT_VOLUME_PROMPT_RULES = [
  'TRAINING VOLUME (non-negotiable):',
  '- Default 2 to 3 working sets per exercise. Beginners 2 to 3. Intermediate 3. Advanced 3, and at most 4 on one main compound only.',
  '- Never prescribe 5 or more working sets on an exercise. Warm-up sets are extra and do not count as working sets.',
  '- About 5 to 7 working exercises per session, not counting warm-up or cooldown stretches. One core finisher per training day (2 max on a dedicated core day).',
  '- Reps by experience: beginners 8 to 15 on compounds. Intermediate 6 to 12. Advanced or strength-focused: 3 to 6 on main compounds only, 8 to 15 on accessories.',
  '- Fit the stated session duration. Prefer fewer quality sets over junk volume.',
  '- Training days per week is a hard cap. Label all 7 calendar days. Remaining days after training days are rest or active recovery. Do not add extra training days. Do not require both a recovery day AND a rest day if that would steal a training day or overflow 7 days. If they train 6 days, one rest. If 7, no extra rest day.',
  '- Proven splits are fine (full body, upper/lower, PPL) when they fit days, duration, equipment, and injuries. Personalise exercise selection. Do not invent unsafe novelty just to be unique.',
].join('\n')

export const EXERCISE_NAME_PROMPT_RULES = [
  'EXERCISE NAMES (for in-app form videos):',
  '- Put the tool in the name when it matters: "Barbell Bench Press", "Dumbbell Romanian Deadlift", "Resistance Band Row".',
  '- One movement per line. No nicknames (skull crushers, BB bench), no two lifts in one name, no muscle-group-only labels.',
  '- Use ordinary coach English. Do not copy a vendor catalog, and never pick a catalog name that would break equipment or injury constraints.',
].join('\n')

export const WORKOUT_SECTION_PROMPT_RULES = [
  'TRACKER SECTIONS (non-negotiable, every training day):',
  '- Under each Day N (Weekday) header, put these exact labels on their own lines, in this order: Warm-up: then Main Workout: then Post-Workout:.',
  '- Warm-up: only easy cardio, joint circles, bodyweight activations, and 1 or 2 very light groove sets. Never working sets of the day\'s main lifts.',
  '- Main Workout: every working lift (compounds, accessories, core finisher). Goblet Squat, RDL, presses, rows, pushdowns, and curls belong here only.',
  '- Post-Workout: only stretches, an easy walk, or breathing. Never strength lifts.',
  '- Do not write a shared warmup essay before Day 1 or a shared stretching block after the week that lists lifts. Repeat the three headers under every training day.',
  '- Never a lone line Recovery or Stretching. Those make the tracker treat the next lifts as Post-Workout.',
  '- Finish Post-Workout before the next Day N header.',
].join('\n')
