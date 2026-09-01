/** Bump this when protein/calorie/volume prompt rules change so cached hard-constraints refresh. */
export const PLAN_QUALITY_RULES_VERSION = 'diet-pref-enforce-v15'

/** Platform minimum daily calories before weight-based floor applies. */
export const DIET_FLOOR_BASE_KCAL = 1900
/** Reject (and retry) only when clearly under the floor; ~1% rounding is tolerated. */
export const DIET_FLOOR_HARD_KCAL = 1880

/** @deprecated Use resolveDietFloorKcal(weight) — kept for static fallbacks. */
export const DIET_FLOOR_TARGET_KCAL = DIET_FLOOR_BASE_KCAL

/** Higher of base floor (~1900) or ~25 kcal/kg — keeps food on the higher side for active clients. */
export function resolveDietFloorKcal(weightKg?: number | string | null): number {
  const weight = Number(weightKg)
  const byWeight = Number.isFinite(weight) && weight > 0 ? Math.round(weight * 25) : 0
  return Math.max(DIET_FLOOR_BASE_KCAL, byWeight)
}

export const DAY_HEADER_PROMPT_RULES = [
  'DAY HEADERS (non-negotiable, diet and workout):',
  '- Label every day as "Day N (Weekday)" with Day 1 = Monday, Day 2 = Tuesday, through Day 7 = Sunday.',
  '- Example: "Day 1 (Monday)", "Day 2 (Tuesday)". Never a bare weekday ("Monday") and never a bare "Day 1" without the weekday in parentheses.',
].join('\n')

export const CALORIE_FORMULA_PROMPT_RULES = [
  'CALORIE FORMULA (non-negotiable for every new or rewritten diet):',
  '- Always derive the daily calorie target with Mifflin-St Jeor: BMR from weight/height/age/gender, then maintenance = BMR × activity factor.',
  '- Use the CALORIE METHOD block in the client profile — it lists this client\'s inputs and reference maintenance. Build meal portions to that reference (±100 kcal), never a round guess like 1800.',
  '- When editing and the client did NOT ask to change calories, keep the current daily average; when rebuilding from profile, always run the formula fresh.',
].join('\n')

export const DIET_PREFERENCE_ENFORCEMENT_RULES = [
  'DIET PREFERENCE ENFORCEMENT (violations are the #1 failure mode — read before writing ANY meal):',
  '- Scan Hard Constraints first. Every meal and every swap on every day must obey diet preference, allergies, dislikes, and custom diet-day exceptions.',
  '- VEGETARIAN: Never write eggs, chicken, fish, mutton, prawn, whey, or any meat/poultry/seafood in ANY meal on ANY day — including swaps and optional lines. Plant proteins only (dal, paneer, soya, chana, dairy, nuts).',
  '- VEGAN: No animal products at all — no dairy, eggs, whey, honey.',
  '- EGGETARIAN: Eggs ONLY on allowed weekdays from Hard Constraints. No chicken, fish, or mutton ever. On veg-only weekdays, zero eggs in any option.',
  '- NON-VEGETARIAN: Schedule chicken, fish, or eggs ONLY on the weekdays listed in Hard Constraints. On all other weekdays every meal must be veg-friendly with no meat, fish, or eggs.',
  '- On weekdays where animal protein IS allowed, include at least one egg, chicken, or fish option in a meal (unless the client dislikes it or budget forbids).',
  '- Before finalizing each day, scan every food word: if diet preference forbids it, delete it.',
  '- If customNotes mention diet-day exceptions (e.g. Sunday family lunch is non-veg), obey ONLY on those days or situations.',
].join('\n')

export const DIET_COACH_WRITING_RULES = [
  'COACH-STYLE DIET WRITING (how client-facing prose should read):',
  '- Write like a coach texting a client they know — warm, practical, slightly informal. Not a generated table.',
  '- Start with the plan directly (a brief 1 to 2 sentence opener is fine; no long generic intro).',
  '- Use the client\'s actual meal names and existing meal timings from onboarding — do not invent new slots.',
  '- 1 to 3 food choices per meal as plain-sentence alternatives with household portions (roti, katori, bowl) plus approx grams.',
  '- After EVERY meal option, one macro line on the next line: (P: 28g | C: 45g | F: 12g | ~400 kcal) for the FULL option described.',
  '- End each day with a Daily Total line summing PRIMARY options only (first option per meal, never primary plus swap).',
  '- Describe dal/curries as final cooked portions (e.g. 1 katori cooked dal, approx 150g) — no raw-to-cooked math in client text.',
  '- Sprinkle casual cooking tips inline (spice, chutney, quick prep) — not a separate tips section.',
  '- Prioritize foods they enjoy; never use allergies or dislikes; keep budget realistic with affordable staples.',
  '- Whey only on training days when the client uses whey — include the scoop in that meal\'s macro line; otherwise food-based protein only.',
  '- Specify ghee/oil/butter teaspoons on cooked meals plus a daily cooking-fat total.',
  '- Close with a casual well-wishing line for the week.',
  '- Do NOT mention coaching week numbers in diet prose.',
  '- After Day 7, add a short realistic roadmap paragraph: how long their goal may take with their current gym or home schedule, encouraging higher metabolic flux (more food paired with more steps/training) when their schedule allows comfortably. If they cannot gym, give a separate honest timeline for home training.',
  '- TRACKER RULE: every day must repeat the FULL meal text under its Day N header. Never write "same as Monday", "repeat Tuesday", or "as above" — if two days match, copy the meals in full under both headers.',
].join('\n')

export const PROTEIN_CALORIE_PROMPT_RULES = [
  'PROTEIN vs CALORIES (non-negotiable):',
  `- Derive the daily calorie target from Mifflin-St Jeor (see CALORIE METHOD). Calories come first so the client can function. Daily average must be at least ${DIET_FLOOR_TARGET_KCAL} kcal.`,
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

export const HIGH_FLUX_PHILOSOPHY_RULES = [
  'HIGH FLUX PHILOSOPHY (non-negotiable):',
  '- Push HIGHER caloric intake paired with HIGHER output (steps, training, cardio). Both sides up — never low food + hope they walk, and never high food + sedentary days.',
  '- Follow CALORIE GUIDANCE rules from the profile — maintenance-level food for active clients, shallow deficit only for fat loss, honest header/meal math.',
  '- Fat loss: mild deficit only; create most of the gap via steps/training/cardio.',
  '- Never respond to "not losing" or a plateau by slashing food; raise steps/training first.',
].join('\n')

export const HIGH_FLUX_OUTPUT_PAIRING_RULES = [
  'HIGH FLUX OUTPUT PAIRING (non-negotiable when calories are on the higher side):',
  '- When daily calories are on the higher side for this client, you MUST also raise output in the same plan.',
  '- Include a daily step target at least ~2,500–4,000 above the client\'s current habit (from onboarding daily steps; if unknown, use 8,000–10,000+ when schedule allows).',
  '- cardio_plan must list concrete walking/LISS sessions — not empty, not "optional walk sometimes".',
  '- If mesocycle volume drops (new month week 1), HOLD food and raise steps/cardio instead of cutting calories.',
].join('\n')

export const EDIT_EXPENDITURE_FIRST_RULES = [
  'PLATEAU / STALL EDIT (client wants progress but did NOT ask to cut calories):',
  '- Do NOT reduce daily calories, portions, or carbs/fats to force fat loss.',
  '- HOLD the current calorie average (within ~75 kcal). You may improve food quality or timing only.',
  '- Tell the client the next lever is steps/training/cardio — not eating less.',
  '- For workout edits: raise daily step targets and/or add sustainable walking/LISS within their schedule and volume caps.',
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
