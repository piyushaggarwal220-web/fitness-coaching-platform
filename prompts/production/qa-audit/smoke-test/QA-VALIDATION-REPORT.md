# AI Coaching QA Validation Report

Generated: 2026-07-08T06:53:07.129Z

## Summary

| Metric | Value |
|--------|-------|
| Personas tested | 5 / 25 |
| Total plans generated | 20 / 100 |
| Failed generations | 0 |
| Average overall quality score | 7.30 / 10 |
| Average diet score | 7.33 / 10 |
| Average workout score | 6.93 / 10 |
| Critical issues detected | 5 |
| Total API input tokens | 46531 |
| Total API output tokens | 64007 |

## Issues (grouped by category)

### Goal misalignment

- **Severity:** medium | **Frequency:** 1/20 plans
  - Calories (~1553) below expected range for muscle_gain (1733-2063).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/20 plans
  - Calories (~1498) below expected range for muscle_gain (1733-2063).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/20 plans
  - Calories (~1287) below expected range for fat_loss (1685-2106).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/20 plans
  - Calories (~1415) below expected range for fat_loss (1685-2106).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/20 plans
  - Calories (~1265) below expected range for fat_loss (1598-1998).
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

### Unrealistic training volume

- **Severity:** medium | **Frequency:** 6/20 plans
  - Only 0 set×rep entries for 3-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout-home.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 3/20 plans
  - Only 0 set×rep entries for 4-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

- **Severity:** medium | **Frequency:** 1/20 plans
  - Only 1 set×rep entries for 4-day program.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-workout.prompt` (do not modify during audit)

### Unrealistic calories

- **Severity:** high | **Frequency:** 1/20 plans
  - Average daily calories (~9487) unusually high.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-diet.prompt` (do not modify during audit)

- **Severity:** critical | **Frequency:** 1/20 plans
  - Average daily calories (~664) dangerously low.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

### Ignored onboarding answers

- **Severity:** low | **Frequency:** 3/20 plans
  - Preferred exercises from onboarding not included.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-workout-home.prompt` (do not modify during audit)

### Wrong equipment

- **Severity:** critical | **Frequency:** 2/20 plans
  - Bands-only client but gym barbell equipment prescribed.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout-home.prompt` (do not modify during audit)

### Contradiction

- **Severity:** critical | **Frequency:** 2/20 plans
  - Vegetarian client but non-veg items appear in diet plan.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-diet.prompt` (do not modify during audit)

### Ignored preferred exercises

- **Severity:** medium | **Frequency:** 1/20 plans
  - Client dislikes "burpees" but it appears in plan.
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `updated-workout.prompt` (do not modify during audit)

### Missing injury considerations

- **Severity:** high | **Frequency:** 1/20 plans
  - Knee injury noted but plan includes "deep squat".
  - Example persona: see qa-audit artifacts tagged with this issue
  - Prompt to inspect: `initial-workout.prompt` (do not modify during audit)

## Per-persona scores

| Persona | Group | Initial Diet | Initial Workout | Weekly Diet | Weekly Workout | Avg |
|---------|-------|--------------|-----------------|-------------|----------------|-----|
| Male beginner, gym | Fat Loss | 7.3 | 7.7 | 8.1 | 7.7 | 7.67 |
| Female beginner, home | Fat Loss | 8.1 | 6.4 | 5.5 | 7.3 | 6.82 |
| Office worker | Fat Loss | — | — | — | — | N/A |
| Night shift worker | Fat Loss | — | — | — | — | N/A |
| Budget client | Fat Loss | — | — | — | — | N/A |
| Skinny beginner | Muscle Gain | — | — | — | — | N/A |
| Intermediate lifter | Muscle Gain | — | — | — | — | N/A |
| Advanced bodybuilder | Muscle Gain | — | — | — | — | N/A |
| Vegetarian muscle gain | Muscle Gain | 7.9 | 7.6 | 7.9 | 7.5 | 7.69 |
| Home workout muscle gain | Muscle Gain | — | — | — | — | N/A |
| Gym recomposition | Body Recomposition | — | — | — | — | N/A |
| Home recomposition | Body Recomposition | — | — | — | — | N/A |
| Powerlifting focused | Strength | — | — | — | — | N/A |
| Runs + lifts | Hybrid Athlete | — | — | — | — | N/A |
| Dumbbells only | Home Workout | — | — | — | — | N/A |
| Resistance bands only | Home Workout | 7.6 | 6.4 | 6.7 | 7.2 | 6.97 |
| Pull-up bar only | Home Workout | — | — | — | — | N/A |
| No equipment | Home Workout | — | — | — | — | N/A |
| College student | Lifestyle | — | — | — | — | N/A |
| Busy parent | Lifestyle | — | — | — | — | N/A |
| Frequent traveller | Lifestyle | — | — | — | — | N/A |
| Knee pain | Special Cases | 7.8 | 7.0 | 7.6 | 7.0 | 7.37 |
| Shoulder discomfort | Special Cases | — | — | — | — | N/A |
| Poor sleep | Special Cases | — | — | — | — | N/A |
| High stress | Special Cases | — | — | — | — | N/A |

## Strengths

Review successful artifacts in `prompts/production/qa-audit/` for examples. Common strengths observed programmatically:

- **Indian meal practicality:** Most diet plans use dal, roti, rice, paneer, and portion cues (katori, grams).
- **Personalization:** Majority of plans reference client name and onboarding meal times.
- **Prompt library integration:** All generations routed through published production prompts with traceable versions.

## Launch Readiness

### Can these plans be sent directly to paying clients?

**Not yet for all personas.** Core outputs are strong but several segments need coach review before delivery.

### Plans that consistently require coach edits

- **Female beginner, home** — 2 low send-readiness score(s)
- **Resistance bands only** — 2 low send-readiness score(s)
- **Male beginner, gym** — 1 low send-readiness score(s)
- **Knee pain** — 1 low send-readiness score(s)

### Top 5 improvements (inspect prompts only — do not modify in this audit)

1. **Calorie header sync** — `initial-diet.prompt` / output schema: top-level Calories/Protein often show 0 while day totals are correct (`plan-format.ts` extraction).
2. **Home equipment enforcement** — `initial-workout-home.prompt`: stricter equipment constraints for dumbbells-only, bands-only, and bodyweight personas.
3. **Weekly update context** — `updated-diet.prompt` / `updated-workout-home.prompt`: ensure check-in notes (hunger, missed sessions, sleep) drive explicit plan changes.
4. **Injury modification** — `initial-workout.prompt` / home variant: knee and shoulder personas still receive aggravating movement patterns.
5. **Budget & lifestyle** — `initial-diet.prompt`: college/budget/traveller personas need more explicit low-cost protein and travel/hotel meal strategies.

---

*Audit artifacts: `prompts/production/qa-audit/*.json`*