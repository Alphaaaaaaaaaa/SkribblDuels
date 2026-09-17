begin;

-- One idempotent owner-only testing grant for the v0.66.1 Slots rollout.
-- Reapplying the migration returns the original ledger row and never credits
-- the account twice. This intentionally creates no reusable owner privilege.
select public.apply_skribbl_coin_transaction(
  'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4'::uuid,
  'owner-test-grant:v0.66.1:analphabetism-slots',
  99999,
  'earn',
  'owner-testing-grant',
  'analphabetism#0:skribbl-slots-v0.66.1',
  1,
  now(),
  null
);

commit;
