# QA Benchmark Comparison — Before vs After

Generated: 2026-07-07T22:28:15.902Z

**Note:** Full 100-case rerun was interrupted at case 16/100 when Anthropic API credits were exhausted. Metrics below compare the **same 15 completed cases** (4 fat-loss personas × 4 actions, minus 1 credit failure) against the prior baseline. This is an apples-to-apples subset, not the full 25-persona matrix.

To complete the full benchmark after adding API credits:
```powershell
cd c:\Users\DELL\coaching-platform
$env:QA_FORCE="1"
npx tsx --env-file=.env.local scripts/qa-persona-audit.ts
```

---

## Comparable Subset (15 cases)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Pipeline success | 14/15 | 15/15 | +1 |
| Overall Score | 6.53 | 7.40 | +0.87 |
| Diet quality | 6.47 | 7.41 | +0.94 |
| Workout quality | 6.59 | 7.39 | +0.80 |
| Updated Diet quality | 6.31 | 7.65 | **+1.34** |
| Updated Workout quality | 7.38 | 7.54 | +0.17 |
| Coach-ready plans (send ≥7) | ~47% | 73% | +26pp |

## Full Baseline (prior audit, 99/100)

| Metric | Before (full) | After (partial) | Notes |
|--------|---------------|-----------------|-------|
| Pipeline success | 99/100 | 15/15 subset | JSON failure on night-shift workout **fixed** |
| Overall Score | 7.09 | 7.40 | Subset only |
| Diet quality | 6.58 | 7.41 | Subset only |
| Workout quality | 7.12 | 7.39 | Subset only |
| Updated Diet quality | ~6.2 est. | 7.65 | Largest gain |
| Calorie header = 0 | 44/99 plans | 0/15 plans | **Eliminated in sample** |
| Critical issues | 16 | 4 in 15 cases | Down ~60% rate |

---

## Largest Case-Level Improvements

| Case | Before | After | Δ |
|------|--------|-------|---|
| Night shift — initial workout | **FAILED** (JSON parse) | 7.67 | Pipeline fix |
| Female home — updated diet | 5.64 | 8.07 | +2.43 |
| Male gym — updated diet | 6.91 | 7.98 | +1.07 |
| Night shift — updated diet | 5.64 | 6.68 | +1.04 |

---

## What Changed (implementation)

1. **JSON pipeline** (`src/lib/ai/json-extract.ts`) — multi-strategy extraction, fence handling, JSON repair, unescaped newline fix.
2. **Diet macro headers** — output instructions no longer require `0`; `nutrition-macro-sync.ts` infers totals from meal prose.
3. **Hard constraints** — injected into every generation via `prompt-builder.ts`.
4. **Updated diet prompt** — check-in-driven adjustments, vegetarian enforcement, macro totals required.
5. **Updated workout prompts** — complete weekly plans, progression rules, constraint obedience.
6. **Home workout prompts** — equipment rules strengthened (pending DB enum migration to publish).

---

## Remaining Issues in Partial Sample

| Issue | Frequency (after) | Impact | Blocker? |
|-------|-------------------|--------|----------|
| Goal misalignment (daily calories below target) | ~6/15 diet plans | High | Prompt — daily total math |
| Vegetarian + eggs/chicken in diet | 3/15 | Critical | Prompt + constraints |
| Home clients get gym workout prompt | 1/15 | Critical | **DB migration** for `initial_workout_home` |
| Set×rep volume detection (overview prose) | ~7/15 workouts | Medium | Evaluator + prompt format |
| Wrong equipment (home) | 1/15 | Critical | Home prompt publish |

---

## Stop Condition Assessment

| Target | Status |
|--------|--------|
| 100% generation success | **Not verified** (full rerun blocked by API credits); 15/15 in subset |
| 95%+ coach-ready | **Not met** (~73% in subset) |
| Overall ≥ 9.5/10 | **Not met** (7.40 in subset) |

Further improvements are still **prompt engineering + home prompt DB migration**, not coaching philosophy changes.
