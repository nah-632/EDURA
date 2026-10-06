-- ---------------------------------------------------------------------------
-- 0003 — Plan pricing revision (2026-10-06, owner decision)
--
-- New commercial model: exactly two active tutor plans —
--   1. 30.000 BHD one-time ("one_time", effectively lifetime listing)
--   2.  5.000 BHD monthly
--
-- ADDITIVE ONLY, per owner mandate:
--   * The `annual` row is DEACTIVATED, never deleted — historical
--     subscriptions keep their plan_id reference (FK is ON DELETE RESTRICT).
--   * `monthly` keeps its id; only its price changes. Existing subscriptions
--     already store their own price snapshot (subscriptions.price), so they
--     are untouched by a plan-price update.
--   * `one_time` is a new interval value + a new plan row.
--   * The duration check is widened (not narrowed) so a one-time plan may
--     carry a long duration; nothing that was valid before becomes invalid.
-- ---------------------------------------------------------------------------

-- 1. Allow the new interval value.
alter table subscription_plans drop constraint subscription_plans_interval_check;
alter table subscription_plans add constraint subscription_plans_interval_check
  check (interval in ('monthly', 'annual', 'one_time'));

-- 2. Widen the duration ceiling for one-time plans only (lifetime listing).
--    Monthly/annual keep the 1–730 day range exactly as before.
alter table subscription_plans drop constraint subscription_plans_duration_days_check;
alter table subscription_plans add constraint subscription_plans_duration_days_check
  check (
    (duration_days between 1 and 730)
    or (interval = 'one_time' and duration_days between 1 and 36500)
  );

-- 3. Monthly plan: new price (5 BHD), same id, same features.
update subscription_plans
   set price = 5.000,
       name_ar = 'خطة شهرية',
       name_en = 'Monthly',
       sort_order = 1
 where code = 'monthly';

-- 4. Annual plan: retire it (hidden from pricing/UI), keep the row.
update subscription_plans
   set is_active = false,
       sort_order = 3
 where code = 'annual';

-- 5. One-time plan: 30 BHD, ~lifetime duration (36500 days ≈ 100 years),
--    no grace period needed (nothing to renew).
insert into subscription_plans (code, name_ar, name_en, price, interval, duration_days, grace_days, features, sort_order) values
  ('one_time', 'خطة لمرة واحدة', 'One-time', 30.000, 'one_time', 36500, 0,
   '["ظهور دائم في نتائج البحث","صفحة معلم كاملة","طلبات حجز غير محدودة","دعم عبر واتساب"]'::jsonb, 2)
on conflict (code) do nothing;
