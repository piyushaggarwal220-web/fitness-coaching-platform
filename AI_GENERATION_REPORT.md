# AI Plan Generation — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Goal

Connect the completed AI pipeline to Claude for plan generation. Server-side only — no UI, no database persistence.

---

## Files created

| File | Purpose |
|---|---|
| `src/lib/ai/generate-plan.ts` | End-to-end plan generation service |

No other files were modified.

---

## Pipeline workflow

```
generatePlan(input)
  │
  ├─ 1. calculateComplexityScore(profile + check-in)
  │
  ├─ 2. getAllKnowledge() — load active knowledge rows
  │
  ├─ 3. buildPrompt() — assemble system + user prompts
  │      └─ append plan JSON schema instructions
  │
  ├─ 4. Select model → complexityScore.recommendedModel
  │      (LOW → Haiku, MEDIUM/HIGH → Sonnet)
  │
  ├─ 5. generateClaudeResponse() — maxTokens: LIMITS.MAX_PLAN_TOKENS
  │
  ├─ 6. parseGeneratedPlanResponse() — extract + validate JSON
  │
  └─ 7. On invalid JSON → retry once with correction instruction
```

---

## Input

```typescript
{
  profile: OnboardingProfile,
  latestCheckin?: Checkin | null,
  coachInstructions?: string | null
}
```

---

## Output

```typescript
{
  generatedPlan: GeneratedPlan,
  model: string,
  complexityScore: ComplexityScoreResult,
  estimatedTokens: number,   // pre-flight estimate from prompt-builder
  inputTokens: number,       // accumulated across attempts
  outputTokens: number       // accumulated across attempts
}
```

### Expected `generatedPlan` shape

```json
{
  "workout_plan": { "overview": "", "days": [] },
  "nutrition_plan": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "meals": [] },
  "cardio_plan": { "sessions": [] },
  "supplement_plan": { "items": [] },
  "coach_notes": ""
}
```

---

## JSON validation

| Field | Rule |
|---|---|
| `workout_plan.overview` | Non-empty string |
| `workout_plan.days` | Array |
| `nutrition_plan.calories` | Positive number |
| `nutrition_plan.protein/carbs/fat` | Non-negative numbers |
| `nutrition_plan.meals` | Array |
| `cardio_plan.sessions` | Array |
| `supplement_plan.items` | Array |
| `coach_notes` | String |

`extractJsonFromResponse()` strips markdown fences and extracts `{...}` from mixed text.

On validation failure: **one automatic retry** with a correction instruction. Throws `GeneratePlanError` if both attempts fail.

---

## Model & token settings

| Setting | Source |
|---|---|
| Model | `complexityScore.recommendedModel` |
| Max output tokens | `LIMITS.MAX_PLAN_TOKENS` (4096) |
| Temperature | `DEFAULTS.DEFAULT_TEMPERATURE` (0.7) |
| Pre-flight estimate | `prompt-builder` `estimateTokens()` |

---

## Exported helpers (unit-testable)

| Export | Purpose |
|---|---|
| `generatePlan()` | Main pipeline entry |
| `profileToComplexityInput()` | Profile → complexity engine mapper |
| `extractJsonFromResponse()` | Parse model text to JSON string |
| `validateGeneratedPlan()` | Schema validation |
| `parseGeneratedPlanResponse()` | Extract + parse + validate |
| `GeneratePlanError` | Typed error class |
| `GeneratedPlan` | Output type |

---

## Usage example

```typescript
import { generatePlan } from '@/lib/ai/generate-plan'

const result = await generatePlan({
  profile,
  latestCheckin,
  coachInstructions: 'Emphasize progressive overload, 4-day split.',
})

// result.generatedPlan.workout_plan.overview
// result.model — actual Claude model used
// result.complexityScore.tier — LOW | MEDIUM | HIGH
```

### Required environment variables

```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_SERVICE_ROLE_KEY=...   # for getAllKnowledge()
```

---

## Not included (by design)

- No UI
- No saving to `plans` table
- No API route wrapper (call `generatePlan()` from server actions/routes later)

---

## Build result

```
npm run build — SUCCESS (exit code 0)
Next.js 16.2.9 — TypeScript passed, 22 routes generated
```
