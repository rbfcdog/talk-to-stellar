# TalkToStellar Financial Assistant Migrations

These migrations support the current payment-focused AI financial assistant work: smart activity feed, financial insights, smart contacts, replay, economy engine, invoices/payment requests, global profile, and AI Treasury.

## Individual migrations

1. `20260512_00_payment_infra_prereqs.sql`
   Creates and upgrades `payment_logs` and `payment_confirmations`, including indexes used by insights, replay, receipts, and payment link flows.

2. `20260512_01_smart_contacts_and_treasury.sql`
   Expands `contacts` with smart-contact fields and creates `currency_rate_history`, `treasury_profiles`, and `treasury_recommendations`.

3. `20260512_02_activity_feed_insights_economy.sql`
   Creates `financial_events` and `financial_insights`, plus economy/savings metadata columns on `operations` and `payment_logs`.

4. `20260512_03_financial_assistant_modules.sql`
   Creates payment-related modules only: `invoices` and `global_profiles`.

5. `20260512_04_remove_non_payment_assistant_modules.sql`
   Drops removed modules if they were already applied: `financial_reminders`, `automation_rules`, and `travel_plans`.

## Condensed migration

Use `20260512_99_financial_assistant_all_in_one.sql` to apply everything above in one run.

Run manually in Supabase SQL Editor, or from the backend with:

```bash
npm run migrate:financial-assistant
```

The TypeScript runner requires `SUPABASE_URL` and one of `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, or `SUPABASE_KEY`.

It also requires the `public.exec_sql(sql text)` RPC to exist. If it does not exist yet, run `bootstrap.sql` or the `createExecSqlFunction` SQL from `backend/src/migrations/agent.migration.ts` first.

## Existing base schema

For a fresh database, run the base schema before these files:

```text
supabase_full_setup.sql
upgrade_payment_logging.sql
add_payment_token_tracking.sql
fix_pin_reset_schema_20260509.sql
20260511_identity_collision_guards.sql
20260512_99_financial_assistant_all_in_one.sql
20260512_04_remove_non_payment_assistant_modules.sql
```

For a database that already runs the current backend, the condensed `20260512_99_financial_assistant_all_in_one.sql` is enough.

If an earlier build already created reminders, automation rules, or travel plans, run `20260512_04_remove_non_payment_assistant_modules.sql` once after deploying this cleanup.
