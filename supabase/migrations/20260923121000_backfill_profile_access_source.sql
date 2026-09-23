-- Tag paid clients that still lack access_source.
-- Prefer purchase when a completed purchase exists; otherwise admin_trial.

WITH paid AS (
  SELECT
    p.id,
    EXISTS (
      SELECT 1
      FROM public.purchases pu
      WHERE pu.user_id = p.id
        AND pu.status IN ('paid', 'captured', 'completed', 'fulfilled')
    ) AS has_purchase
  FROM public.profiles p
  WHERE p.payment_confirmed = true
    AND p.role = 'client'
    AND p.access_source IS NULL
)
UPDATE public.profiles p
SET
  access_source = CASE WHEN paid.has_purchase THEN 'purchase' ELSE 'admin_trial' END,
  updated_at = now()
FROM paid
WHERE p.id = paid.id;
