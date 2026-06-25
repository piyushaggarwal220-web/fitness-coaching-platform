# AI Prompt Builder — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Goal

Reusable, deterministic prompt assembly pipeline for AI coaching flows. No model calls, no plan generation.

---

## Files created

| File | Purpose |
|---|---|
| `src/lib/ai/prompt-builder.ts` | Prompt assembly, knowledge selection, token estimation |

No other files were modified.

---

## Main export

```typescript
buildPrompt(input: PromptBuilderInput): PromptBuilderResult
```

### Input

| Field | Type | Description |
|---|---|---|
| `profile` | `OnboardingProfile` | Client onboarding data |
| `latestCheckin` | `Checkin \| null` | Optional latest weekly check-in |
| `complexityScore` | `ComplexityScoreResult` | From complexity-score engine |
| `knowledgeEntries` | `AiKnowledge[]` | Pre-fetched knowledge rows |
| `coachInstructions` | `string \| null` | Optional coach overrides |

### Output

```typescript
{
  systemPrompt: string,
  userPrompt: string,
  selectedKnowledge: string[],  // category keys applied
  estimatedTokens: number
}
```

---

## Prompt structure

### System prompt (fixed section order)

1. **Role** — Coaching assistant identity and principles
2. **Complexity context** — Tier-specific guidance (LOW / MEDIUM / HIGH)
3. **Response guidelines** — Safety, specificity, no hallucination rules
4. **Coaching knowledge base** — Filtered `title`, `category`, `version`, `content` blocks

### User prompt (fixed section order)

1. **Client profile** — All onboarding fields with human-readable labels
2. **Latest check-in** — Included only when provided
3. **Complexity assessment** — Score, tier, reasoning factors
4. **Coach instructions** — Included only when provided
5. **Task** — Generic coaching guidance request (no plan-specific logic yet)

---

## Knowledge selection logic

Selection is driven by exported config maps — add goals/categories without changing `buildPrompt()`.

### Goal-based (always)

| Fitness goal | Categories injected |
|---|---|
| `fat_loss` | `fat_loss`, `nutrition`, `cardio`, `recovery` |
| `muscle_gain` | `muscle_gain`, `nutrition`, `supplements`, `recovery` |
| `recomposition` | `recomposition`, `nutrition`, `cardio`, `recovery` |
| `strength` | `strength`, `nutrition`, `recovery` |
| `athletic_performance` | `strength`, `cardio`, `nutrition`, `recovery` |
| *(missing/unknown)* | `nutrition`, `recovery` |

### Conditional (additive)

| Condition | Category added |
|---|---|
| `injuries` field has text | `injuries` |
| `gender === 'female'` | `female` |
| `training_experience === 'beginner'` | `beginner` |
| `training_experience === 'intermediate'` | `intermediate` |
| `training_experience === 'advanced'` | `advanced` |

Categories are deduplicated and sorted alphabetically for deterministic output.

### Entry filtering

`filterKnowledgeEntries()` keeps only `active` rows matching selected categories, ordered by category then version (newest first).

---

## Estimated token calculation

```typescript
estimateTokens(...texts) → Math.ceil(combinedCharacterLength / 4)
```

Applied to `systemPrompt + userPrompt` combined. This is a fast heuristic (~4 chars/token for English) suitable for pre-flight budget checks before calling Claude.

---

## Additional exports (unit-testable)

| Export | Purpose |
|---|---|
| `selectKnowledgeCategories()` | Category selection from profile alone |
| `filterKnowledgeEntries()` | Filter/sort knowledge rows |
| `estimateTokens()` | Token heuristic |
| `GOAL_KNOWLEDGE_CATEGORIES` | Goal → category map |
| `TRAINING_KNOWLEDGE_CATEGORY` | Experience → category map |

---

## Usage example

```typescript
import { buildPrompt } from '@/lib/ai/prompt-builder'
import { calculateComplexityScore } from '@/lib/ai/complexity-score'
import { getAllKnowledge } from '@/lib/ai/knowledge'

const complexityScore = calculateComplexityScore({ /* profile fields */ })
const { data: knowledgeEntries } = await getAllKnowledge()

const prompt = buildPrompt({
  profile,
  latestCheckin,
  complexityScore,
  knowledgeEntries,
  coachInstructions: 'Focus on sustainable deficit, not aggressive cuts.',
})

// prompt.systemPrompt, prompt.userPrompt → pass to generateClaudeResponse() later
```

---

## Build result

```
npm run build — SUCCESS (exit code 0)
Next.js 16.2.9 — TypeScript passed, 22 routes generated
```
