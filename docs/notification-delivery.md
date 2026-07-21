# Notification delivery scheduling

The application is designed to work on Vercel Hobby without a frequent cron:

- In-app notifications are persisted synchronously and delivered through Supabase Realtime.
- The newly-created event's Web Push job is drained with Next.js `after()` after the response finishes.
- Authenticated API activity and notification reads schedule a bounded opportunistic drain. A database lease allows one catch-up drain every 30 seconds across instances.
- A protected Vercel cron runs once daily to reconcile retries, expired claims, and dead-letter candidates.

The durable outbox remains the source of truth. Post-response or provider failures never fail the originating request; unprocessed jobs remain queued with atomic claims, idempotency keys, retry backoff, and stale-claim recovery.

Vercel Hobby does not provide exact delayed scheduling. Email/WhatsApp unread escalations become eligible at their configured time, then run on the next authenticated activity or daily reconciliation. Exact timing requires Vercel Pro cron or an authenticated external scheduler calling `/api/cron/notification-delivery` with `Authorization: Bearer $CRON_SECRET`.

The worker endpoint is never public: production requests fail closed when `CRON_SECRET` is absent or invalid.
