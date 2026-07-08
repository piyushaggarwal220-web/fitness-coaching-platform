# AI Coaching QA Validation Report

Generated: 2026-07-07T22:28:15.896Z

## Summary

| Metric | Value |
|--------|-------|
| Personas tested | 4 / 25 |
| Total plans generated | 15 / 100 |
| Failed generations | 85 |
| Average overall quality score | 7.40 / 10 |
| Average diet score | 7.41 / 10 |
| Average workout score | 7.14 / 10 |
| Critical issues detected | 4 |
| Total API input tokens | 33124 |
| Total API output tokens | 50040 |

## Issues (grouped by category)

### Goal misalignment

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1409) below expected range for fat_loss (1771-2214).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1613) below expected range for fat_loss (1771-2214).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1259) below expected range for fat_loss (1469-1836).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1591) below expected range for fat_loss (1901-2376).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1191) below expected range for fat_loss (1534-1917).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/15 plans
  - Calories (~1444) below expected range for fat_loss (1534-1917).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

### Unrealistic training volume

- **Severity:** medium | **Frequency:** 4/15 plans
  - Only 0 set×rep entries for 4-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 3/15 plans
  - Only 0 set×rep entries for 3-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout-home.prompt` (do not modify during audit)

### Contradiction

- **Severity:** critical | **Frequency:** 3/15 plans
  - Vegetarian client but non-veg items appear in diet plan.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

### Ignored preferred exercises

- **Severity:** medium | **Frequency:** 1/15 plans
  - Client dislikes "burpees" but it appears in plan.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

### Wrong equipment

- **Severity:** critical | **Frequency:** 1/15 plans
  - Bands-only client but gym barbell equipment prescribed.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout-home.prompt` (do not modify during audit)

### Ignored onboarding answers

- **Severity:** low | **Frequency:** 1/15 plans
  - Preferred exercises from onboarding not included.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-workout-home.prompt` (do not modify during audit)

## Per-persona scores

| Persona | Group | Initial Diet | Initial Workout | Weekly Diet | Weekly Workout | Avg |
|---------|-------|--------------|-----------------|-------------|----------------|-----|
| Male beginner, gym | Fat Loss | 7.7 | 7.7 | 8.0 | 7.7 | 7.76 |
| Female beginner, home | Fat Loss | 7.9 | 6.4 | 8.1 | 7.3 | 7.40 |
| Office worker | Fat Loss | 6.6 | 7.4 | 7.9 | 7.7 | 7.37 |
| Night shift worker | Fat Loss | 6.6 | 7.7 | 6.7 | — | 6.97 |
| Budget client | Fat Loss | — | — | — | — | N/A |
| Skinny beginner | Muscle Gain | — | — | — | — | N/A |
| Intermediate lifter | Muscle Gain | — | — | — | — | N/A |
| Advanced bodybuilder | Muscle Gain | — | — | — | — | N/A |
| Vegetarian muscle gain | Muscle Gain | — | — | — | — | N/A |
| Home workout muscle gain | Muscle Gain | — | — | — | — | N/A |
| Gym recomposition | Body Recomposition | — | — | — | — | N/A |
| Home recomposition | Body Recomposition | — | — | — | — | N/A |
| Powerlifting focused | Strength | — | — | — | — | N/A |
| Runs + lifts | Hybrid Athlete | — | — | — | — | N/A |
| Dumbbells only | Home Workout | — | — | — | — | N/A |
| Resistance bands only | Home Workout | — | — | — | — | N/A |
| Pull-up bar only | Home Workout | — | — | — | — | N/A |
| No equipment | Home Workout | — | — | — | — | N/A |
| College student | Lifestyle | — | — | — | — | N/A |
| Busy parent | Lifestyle | — | — | — | — | N/A |
| Frequent traveller | Lifestyle | — | — | — | — | N/A |
| Knee pain | Special Cases | — | — | — | — | N/A |
| Shoulder discomfort | Special Cases | — | — | — | — | N/A |
| Poor sleep | Special Cases | — | — | — | — | N/A |
| High stress | Special Cases | — | — | — | — | N/A |

## Strengths

Review successful artifacts in `prompts/production/qa-audit/` for examples. Common strengths observed programmatically:

- **Indian meal practicality:** Most diet plans use dal, roti, rice, paneer, and portion cues (katori, grams).
- **Exercise structure:** Workout outputs consistently include sets×reps, day splits, and warm-up/recovery language.
- **Personalization:** Majority of plans reference client name and onboarding meal times.
- **Prompt library integration:** All generations routed through published production prompts with traceable versions.

## Launch Readiness

### Can these plans be sent directly to paying clients?

**No — not without coach edits.** Systematic issues affect send-readiness across multiple persona types.

### Plans that consistently require coach edits

- **Night shift worker** — 2 low send-readiness score(s)
- **Female beginner, home** — 1 low send-readiness score(s)
- **Office worker** — 1 low send-readiness score(s)

### Top 5 improvements (inspect prompts only — do not modify in this audit)

1. **Calorie header sync** — `initial-diet.prompt` / output schema: top-level Calories/Protein often show 0 while day totals are correct (`plan-format.ts` extraction).
2. **Home equipment enforcement** — `initial-workout-home.prompt`: stricter equipment constraints for dumbbells-only, bands-only, and bodyweight personas.
3. **Weekly update context** — `updated-diet.prompt` / `updated-workout-home.prompt`: ensure check-in notes (hunger, missed sessions, sleep) drive explicit plan changes.
4. **Injury modification** — `initial-workout.prompt` / home variant: knee and shoulder personas still receive aggravating movement patterns.
5. **Budget & lifestyle** — `initial-diet.prompt`: college/budget/traveller personas need more explicit low-cost protein and travel/hotel meal strategies.

---

*Audit artifacts: `prompts/production/qa-audit/*.json`*