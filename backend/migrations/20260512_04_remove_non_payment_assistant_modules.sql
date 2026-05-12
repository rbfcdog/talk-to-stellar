-- Remove non-payment assistant modules.
-- Drops Smart Reminders, Financial Automation Rules, and Travel Mode.
-- The remaining financial assistant scope stays focused on payments,
-- recipients, payment requests, insights, feed, economy, and global profiles.

BEGIN;

DROP TRIGGER IF EXISTS update_financial_reminders_updated_at ON public.financial_reminders;
DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON public.automation_rules;
DROP TRIGGER IF EXISTS update_travel_plans_updated_at ON public.travel_plans;

DROP TABLE IF EXISTS public.financial_reminders CASCADE;
DROP TABLE IF EXISTS public.automation_rules CASCADE;
DROP TABLE IF EXISTS public.travel_plans CASCADE;

COMMIT;
