# LURVOX AI Marketing Operating System

## Existing architecture (inspected)

- **App:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4
- **Brand:** Lurvox (`src/lib/brand.ts`)
- **Auth:** Supabase SSR + `isAdminRole` / `is_platform_admin()` RLS
- **Admin UI:** `/admin/*` with `AdminNavbar`, `adminStyles`, module registry
- **AI:** Server-side OpenAI (`src/lib/ai/openai.ts`) + Anthropic fallback; Zod + JSON extract
- **Meta today:** Pixel + Conversions API only (purchase attribution) — **no Ads Marketing API**
- **Jobs:** Vercel Cron + `CRON_SECRET` Bearer auth
- **DB:** Supabase Postgres; service role via `createAdminClient()`
- **Audit:** `admin_audit_logs`, `ai_generation_logs`

## Proposed architecture

```
DATA (Meta + funnel + Instagram)
  → ANALYSIS (Analytics Agent)
  → AI DECISION (Marketing Brain + Decision Engine)
  → GUARDRAILS + AUTONOMY LEVEL CHECK
  → CREATIVE GENERATION (Static / UGC / Video)
  → HUMAN APPROVAL (default level 2)
  → META ACTION (only when permitted)
  → PERFORMANCE → ANALYSIS → REPEAT
```

Autonomy levels (`MARKETING_AUTONOMY_LEVEL`):

| Level | Behavior |
|------|----------|
| 0 | Disabled |
| 1 | Recommendations only |
| 2 | Generate + propose; **approval required** (default) |
| 3 | Guarded autonomy (low-risk auto; explicit enable required) |
| 4 | Full autonomy within hard caps (explicit enable + confirmation) |

Levels 3–4 cannot be set without `confirm_high_autonomy: true`.

## Module layout

```
src/lib/ai-marketing/          # core OS
src/app/api/admin/ai-marketing/ # admin APIs
src/app/api/cron/ai-marketing-* # scheduled jobs
src/app/admin/ai-marketing/     # dashboard
supabase/migrations/*_ai_marketing_os.sql
scripts/verify-ai-marketing.ts
```

## Files created / modified

See git status after implementation. Primary additions under `src/lib/ai-marketing`, `src/app/admin/ai-marketing`, `src/app/api/admin/ai-marketing`, cron routes, migration, docs, env example, admin modules, vercel crons.

## Database

Tables: creatives, campaigns, adsets, ads, performance, experiments, ai_decisions, ai_actions, content, generation_jobs, video_edit_jobs, settings, audit_events, funnel_snapshots, instagram_posts.

Admin-only RLS via `is_platform_admin()`. Writes via service role.

## Integrations required

- `OPENAI_API_KEY` (existing)
- `META_ADS_ACCESS_TOKEN`, `META_ADS_AD_ACCOUNT_ID`, `META_ADS_API_VERSION` (new)
- Optional: UGC/video provider keys later

## Multi-funnel economics (required)

LURVOX has independent acquisition funnels. Never use one global TARGET_CPA.

Seeded funnels:
- lurvox-99 — LURVOX ₹99 Funnel (low-ticket; own CPA/ROAS/budgets; tracks downstream separately)
- lurvox-1699 — LURVOX ₹1,699 Funnel (higher-ticket; independent thresholds)

Campaigns/ad sets/ads/creatives/performance carry `funnel_id` (null = UNCLASSIFIED — never guess).
Assign via dashboard Campaigns tab or PATCH `/api/admin/ai-marketing/funnels`.

Account guardrails = spend/change caps only.
Per-funnel economics live on `marketing_funnels`.
Daily report: `/api/admin/ai-marketing/report` and dashboard Daily Report tab.
