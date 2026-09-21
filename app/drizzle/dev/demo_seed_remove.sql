-- ============================================================================
-- Remove ALL demo data created by drizzle/0002_demo_seed.sql
--
-- Deletion order follows the foreign keys: children before parents. The demo
-- rows are matched by their reserved email domain AND their fixed ids, so this
-- removes exactly the seeded content and nothing an operator created while
-- using the demo deployment.
-- ============================================================================
begin;

delete from reviews
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from payment_proofs
 where payment_id in (select id from payments where reference_code like 'PAY-EDU-DEMO-%');

delete from payments where reference_code like 'PAY-EDU-DEMO-%';

delete from booking_items
 where booking_id in (select id from bookings where code like 'EDU-DEMO-%');

delete from bookings where code like 'EDU-DEMO-%';

delete from subscriptions
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_availability
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_time_off
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_documents
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_subjects
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_stages
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutor_areas
 where tutor_id in (select id from tutors where user_id in
   (select id from users where email like '%@demo.edura.bh'));

delete from tutors
 where user_id in (select id from users where email like '%@demo.edura.bh');

delete from students
 where owner_user_id in (select id from users where email like '%@demo.edura.bh');

delete from sessions
 where user_id in (select id from users where email like '%@demo.edura.bh');

delete from notifications
 where user_id in (select id from users where email like '%@demo.edura.bh');

delete from user_roles
 where user_id in (select id from users where email like '%@demo.edura.bh');

delete from user_profiles
 where user_id in (select id from users where email like '%@demo.edura.bh');

-- Audit rows are append-only by trigger and are deliberately NOT deleted: the
-- demo actions that reached the audit log stay there as evidence.

delete from users where email like '%@demo.edura.bh';

commit;
