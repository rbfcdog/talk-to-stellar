BEGIN;

ALTER TABLE IF EXISTS public.global_profiles
  ALTER COLUMN accepted_currencies SET DEFAULT '{USD,BRL,EUR}';

UPDATE public.global_profiles
SET accepted_currencies = array_append(
  CASE
    WHEN accepted_currencies IS NULL OR array_length(accepted_currencies, 1) IS NULL THEN ARRAY['USD', 'BRL']::TEXT[]
    ELSE accepted_currencies
  END,
  'EUR'
)
WHERE NOT (
  CASE
    WHEN accepted_currencies IS NULL OR array_length(accepted_currencies, 1) IS NULL THEN ARRAY['USD', 'BRL']::TEXT[]
    ELSE accepted_currencies
  END
  @> ARRAY['EUR']::TEXT[]
);

DO $$
BEGIN
  IF to_regclass('public.whitelisted_assets') IS NOT NULL THEN
    INSERT INTO public.whitelisted_assets (asset_code, asset_issuer, trusted)
    VALUES ('EURC', NULL, true)
    ON CONFLICT (asset_code) DO UPDATE SET trusted = EXCLUDED.trusted;
  END IF;
END $$;

COMMIT;
