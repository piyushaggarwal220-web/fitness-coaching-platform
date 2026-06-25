# AI Knowledge Base — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Goal

Store all coaching knowledge in the database instead of hardcoding it. No Claude integration or plan generation in this phase.

---

## Files created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619300000_create_ai_knowledge.sql` | `ai_knowledge` table, indexes, RLS |
| `src/lib/ai/knowledge.ts` | Server-side CRUD functions for knowledge entries |

---

## Files modified

| File | Change |
|---|---|
| `src/types/database.ts` | Added `AiKnowledge`, `AiKnowledgeCategory`, `CreateAiKnowledgeInput`, `UpdateAiKnowledgeInput` |

---

## Database: `ai_knowledge`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `title` | `text` | Entry title |
| `category` | `text` | CHECK-constrained enum |
| `content` | `text` | Knowledge body |
| `version` | `integer` | Default `1` |
| `active` | `boolean` | Default `true` |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-set on write |

### Categories

`fat_loss`, `muscle_gain`, `recomposition`, `strength`, `nutrition`, `cardio`, `supplements`, `recovery`, `checkins`, `injuries`, `female`, `beginner`, `intermediate`, `advanced`

### RLS

- **SELECT:** Authenticated users can read `active = true` rows (future admin UI)
- **INSERT/UPDATE:** Service role only (via `createAdminClient`)

---

## Library API (`src/lib/ai/knowledge.ts`)

| Function | Description |
|---|---|
| `getKnowledge(category)` | Active entries for one category, newest version first |
| `getAllKnowledge()` | All active entries, ordered by category then version |
| `createKnowledge(input)` | Insert entry (defaults: `version=1`, `active=true`) |
| `updateKnowledge(id, input)` | Partial update with `updated_at` refresh |

Also exports `KNOWLEDGE_CATEGORIES` and `KnowledgeResult<T>` type.

All functions use `createAdminClient()` — server-side only, requires `SUPABASE_SERVICE_ROLE_KEY`.

---

## Usage example

```typescript
import { getKnowledge, createKnowledge } from '@/lib/ai/knowledge'

// Read active fat-loss knowledge for AI context (future)
const { data, error } = await getKnowledge('fat_loss')

// Seed a new entry
await createKnowledge({
  title: 'Fat loss calorie deficit guidelines',
  category: 'fat_loss',
  content: 'Target 300–500 kcal deficit. Protein 1.6–2.2 g/kg...',
})
```

---

## Not included (by design)

- Claude / Anthropic integration
- Plan or check-in AI generation
- Admin UI for managing knowledge
- Seed data migration

---

## Before going live

Run the migration in Supabase SQL editor:

`supabase/migrations/20260619300000_create_ai_knowledge.sql`

Ensure `SUPABASE_SERVICE_ROLE_KEY` is set for server-side write operations.

---

## Build result

```
npm run build — SUCCESS (exit code 0)
Next.js 16.2.9 — TypeScript passed, 22 routes generated
```
