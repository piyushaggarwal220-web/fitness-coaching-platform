ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS preferred_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchases_preferred_coach_id_idx
  ON public.purchases(preferred_coach_id)
  WHERE preferred_coach_id IS NOT NULL;

COMMENT ON COLUMN public.purchases.preferred_coach_id IS
  'If set, claim fulfillment assigns this coach instead of auto-assign.';
