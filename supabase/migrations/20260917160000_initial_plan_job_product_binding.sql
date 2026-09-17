-- Stamp Instant vs coaching product on initial plan jobs so fulfillment
-- cannot flip when a client later buys the other product line.
ALTER TABLE public.initial_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_slug text,
  ADD COLUMN IF NOT EXISTS product_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initial_plan_generation_jobs_product_kind_check'
  ) THEN
    ALTER TABLE public.initial_plan_generation_jobs
      ADD CONSTRAINT initial_plan_generation_jobs_product_kind_check
      CHECK (product_kind IS NULL OR product_kind IN ('coaching', 'digital'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS initial_plan_generation_jobs_purchase_id_idx
  ON public.initial_plan_generation_jobs (purchase_id)
  WHERE purchase_id IS NOT NULL;
