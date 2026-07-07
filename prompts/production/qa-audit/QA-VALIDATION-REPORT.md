# AI Coaching QA Validation Report

Generated: 2026-07-07T20:55:04.046Z

## Summary

| Metric | Value |
|--------|-------|
| Personas tested | 1 / 25 |
| Total plans generated | 4 / 100 |
| Failed generations | 0 |
| Average overall quality score | 7.28 / 10 |
| Average diet score | 6.79 / 10 |
| Average workout score | 7.33 / 10 |
| Critical issues detected | 0 |
| Total API input tokens | 8328 |
| Total API output tokens | 10460 |

## Issues (grouped by category)

### Unrealistic calories

- **Severity:** high | **Frequency:** 2/4 plans
  - No clear daily calorie totals found (header may show 0).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

### Unrealistic training volume

- **Severity:** medium | **Frequency:** 2/4 plans
  - Only 0 set×rep entries for 4-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

### Ignored preferred exercises

- **Severity:** medium | **Frequency:** 1/4 plans
  - Client dislikes "burpees" but it appears in plan.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

### Missing personalization

- **Severity:** medium | **Frequency:** 1/4 plans
  - Output does not mention client first name (Arjun).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-workout.prompt` (do not modify during audit)

## Per-persona scores

| Persona | Group | Initial Diet | Initial Workout | Weekly Diet | Weekly Workout | Avg |
|---------|-------|--------------|-----------------|-------------|----------------|-----|
| Male beginner, gym | Fat Loss | 7.1 | 7.7 | 6.9 | 7.4 | 7.28 |
| Female beginner, home | Fat Loss | — | — | — | — | N/A |
| Office worker | Fat Loss | — | — | — | — | N/A |
| Night shift worker | Fat Loss | — | — | — | — | N/A |
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

- **Exercise structure:** Workout outputs consistently include sets×reps, day splits, and warm-up/recovery language.
- **Personalization:** Majority of plans reference client name and onboarding meal times.
- **Prompt library integration:** All generations routed through published production prompts with traceable versions.

## Launch Readiness

### Can these plans be sent directly to paying clients?

**Not yet for all personas.** Core outputs are strong but several segments need coach review before delivery.

### Plans that consistently require coach edits

- **Male beginner, gym** — 2 low send-readiness score(s)

### Top 5 improvements (inspect prompts only — do not modify in this audit)

1. **Calorie header sync** — `initial-diet.prompt` / output schema: top-level Calories/Protein often show 0 while day totals are correct (`plan-format.ts` extraction).
2. **Home equipment enforcement** — `initial-workout-home.prompt`: stricter equipment constraints for dumbbells-only, bands-only, and bodyweight personas.
3. **Weekly update context** — `updated-diet.prompt` / `updated-workout-home.prompt`: ensure check-in notes (hunger, missed sessions, sleep) drive explicit plan changes.
4. **Injury modification** — `initial-workout.prompt` / home variant: knee and shoulder personas still receive aggravating movement patterns.
5. **Budget & lifestyle** — `initial-diet.prompt`: college/budget/traveller personas need more explicit low-cost protein and travel/hotel meal strategies.

---

*Audit artifacts: `prompts/production/qa-audit/*.json`*