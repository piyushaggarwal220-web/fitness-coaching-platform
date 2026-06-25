# Complexity Score Engine — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Files created

| File | Purpose |
|---|---|
| `src/lib/ai/complexity-score.ts` | Pure TypeScript complexity scoring engine with model routing |

No other files were modified.

---

## Inputs evaluated

| Input | Source field | Scoring applied |
|---|---|---|
| `age` | `profiles.age` | +2 if &lt;18 or ≥55; +1 if 45–54 |
| `gender` | `profiles.gender` | +1 if female with fat-loss or recomposition goal |
| `height` + `weight` | `profiles.height`, `profiles.weight` | BMI-derived: +1 underweight/overweight; +2 obese |
| `bodyFat` (optional) | not in DB yet | +1 elevated (≥25%); +2 high (≥35%); +1 very low (&lt;10%) |
| `fitnessGoal` | `profiles.fitness_goal` | 0–3 by goal (recomposition highest) |
| `activityLevel` | `profiles.activity_level` | +1 sedentary or very active |
| `trainingExperience` | `profiles.training_experience` | +1 beginner; +2 advanced |
| `dietPreference` | `profiles.diet_preference` | +1 vegetarian/eggetarian; +2 vegan |
| `injuries` | `profiles.injuries` | +3 if non-empty text |
| `medicalNotes` | `profiles.medical_notes` | +3 if non-empty text |
| `sleepDuration` | `profiles.sleep_duration` | +2 &lt;6h; +1 6–7h |
| `latestCheckin` (optional) | `checkins` table | Adherence, energy, performance, hunger, notes |

All rules are defined in the exported `SCORING_SPEC` constant inside `complexity-score.ts`.

---

## Output structure

```typescript
{
  score: number,           // Sum of all point contributions
  tier: "LOW" | "MEDIUM" | "HIGH",
  recommendedModel: string, // Claude model ID from config
  reasoning: string[]      // Human-readable "+N: reason" per factor
}
```

### Tier cutoffs

| Tier | Score range |
|---|---|
| `LOW` | 0 – 4 |
| `MEDIUM` | 5 – 10 |
| `HIGH` | 11+ |

---

## Model routing rules

| Tier | Model constant | Model ID |
|---|---|---|
| `LOW` | `MODELS.CLAUDE_HAIKU` | `claude-haiku-4-5-20251001` |
| `MEDIUM` | `MODELS.CLAUDE_SONNET` | `claude-sonnet-4-20250514` |
| `HIGH` | `MODELS.CLAUDE_SONNET` | `claude-sonnet-4-20250514` |

Model IDs are imported from `src/lib/ai/config.ts` — never hardcoded in the engine.

---

## Exported API

| Export | Purpose |
|---|---|
| `calculateComplexityScore()` | Main entry — returns full result |
| `calculateBmi()` | BMI helper (unit-testable) |
| `getTierFromScore()` | Tier lookup from numeric score |
| `getRecommendedModelForTier()` | Model routing from tier |
| `SCORING_SPEC` | Canonical scoring rules object |
| `ComplexityScoreInput` | Strongly typed input |
| `ComplexityScoreResult` | Strongly typed output |
| `ComplexityTier` | Tier union type |

---

## Design constraints met

- Pure TypeScript — no database, no API calls, no side effects
- Unit-testable — each scorer is a small pure function; `SCORING_SPEC` is the single rules source
- Strong typing — input/output types and `Checkin` subset for latest check-in
- Server-safe — lib module only; no client exposure

---

## Usage example

```typescript
import { calculateComplexityScore } from '@/lib/ai/complexity-score'

const result = calculateComplexityScore({
  age: 32,
  gender: 'male',
  height: 180,
  weight: 95,
  fitnessGoal: 'recomposition',
  activityLevel: 'moderately_active',
  trainingExperience: 'intermediate',
  dietPreference: 'non_vegetarian',
  injuries: null,
  medicalNotes: null,
  sleepDuration: '7_to_8',
  latestCheckin: {
    energy_level: 6,
    hunger_level: 7,
    training_performance: 7,
    adherence_score: 8,
    notes: null,
  },
})

// result.tier → "MEDIUM" or "HIGH"
// result.recommendedModel → MODELS.CLAUDE_SONNET
```

---

## Build result

```
npm run build — SUCCESS (exit code 0)
Next.js 16.2.9 — TypeScript passed, 22 routes generated
```
