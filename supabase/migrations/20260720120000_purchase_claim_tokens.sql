-- Deferred account claim fields for post-payment signup recovery

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS claim_token_hash text,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS purchases_customer_email_lower_idx
  ON purchases (lower(customer_email));

CREATE INDEX IF NOT EXISTS purchases_claim_token_hash_idx
  ON purchases (claim_token_hash)
  WHERE claim_token_hash IS NOT NULL;
