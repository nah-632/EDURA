-- ============================================================================
-- EDURA — DEMO DATA (NOT REAL PLATFORM ACTIVITY)
--
-- Every row created here is demo content for development, previews and QA:
--   * accounts use the reserved domain @demo.edura.bh
--   * names, prices and bookings are invented
--   * NO privileged account is created (no admin, no moderator) — bootstrapping
--     an administrator is a deliberate operator action, not seed data
--
-- DEMO CREDENTIALS (development only; never enable on a public deployment):
--   demo.parent1@demo.edura.bh   EduraDemo#2026
--   demo.parent2@demo.edura.bh   EduraDemo#2026
--   demo.tutor1@demo.edura.bh    EduraTutor#2026
--   demo.tutor2@demo.edura.bh    EduraTutor#2026
--   demo.tutor3@demo.edura.bh    EduraTutor#2026
--
-- Remove everything in this file with: drizzle/dev/demo_seed_remove.sql
-- Re-running is safe: every insert is guarded.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
insert into users (id, email, phone, password_hash, primary_role, status, locale) values
  ('d0d0d0d0-0000-4000-8000-000000000101', 'demo.parent1@demo.edura.bh', '+97336000101',
   'scrypt$32768$8$1$I1H74DkCikfZL+4T9MEO/A==$HO7f+WugTh/A8d12QN50l1VLPO11wbOxKMe9ZyIGu7TRH9hUWk8jbryXuzgoMI3K+2XC6heyn3EB3LRgUKUJVA==',
   'parent', 'active', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000102', 'demo.parent2@demo.edura.bh', '+97336000102',
   'scrypt$32768$8$1$I1H74DkCikfZL+4T9MEO/A==$HO7f+WugTh/A8d12QN50l1VLPO11wbOxKMe9ZyIGu7TRH9hUWk8jbryXuzgoMI3K+2XC6heyn3EB3LRgUKUJVA==',
   'student', 'active', 'en'),
  ('d0d0d0d0-0000-4000-8000-000000000201', 'demo.tutor1@demo.edura.bh', '+97336000201',
   'scrypt$32768$8$1$DXO3hXKMzAhqWa4BbcA3lw==$OpxxEPnN+fvckwub8k+Xg1b3tqvjefb614bl19Trjg9atEQ22LZX1ZNcFP5zskVnAMy0T8XNm3SngdKRkOqzpg==',
   'tutor', 'active', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000202', 'demo.tutor2@demo.edura.bh', '+97336000202',
   'scrypt$32768$8$1$DXO3hXKMzAhqWa4BbcA3lw==$OpxxEPnN+fvckwub8k+Xg1b3tqvjefb614bl19Trjg9atEQ22LZX1ZNcFP5zskVnAMy0T8XNm3SngdKRkOqzpg==',
   'tutor', 'active', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000203', 'demo.tutor3@demo.edura.bh', '+97336000203',
   'scrypt$32768$8$1$DXO3hXKMzAhqWa4BbcA3lw==$OpxxEPnN+fvckwub8k+Xg1b3tqvjefb614bl19Trjg9atEQ22LZX1ZNcFP5zskVnAMy0T8XNm3SngdKRkOqzpg==',
   'tutor', 'active', 'en')
on conflict (id) do nothing;

insert into user_profiles (user_id, full_name, full_name_ar, preferred_locale) values
  ('d0d0d0d0-0000-4000-8000-000000000101', 'Fatima Al Zayani', 'فاطمة الزياني', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000102', 'Ali Darwish', 'علي درويش', 'en'),
  ('d0d0d0d0-0000-4000-8000-000000000201', 'Ahmed Al Mannai', 'أحمد المناعي', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000202', 'Mariam Bucheeri', 'مريم بوچيري', 'ar'),
  ('d0d0d0d0-0000-4000-8000-000000000203', 'Yusuf Kanoo', 'يوسف كانو', 'en')
on conflict (user_id) do nothing;

insert into user_roles (user_id, role_id)
select v.user_id, r.id
  from (values
    ('d0d0d0d0-0000-4000-8000-000000000101'::uuid, 'student'),
    ('d0d0d0d0-0000-4000-8000-000000000102'::uuid, 'student'),
    ('d0d0d0d0-0000-4000-8000-000000000201'::uuid, 'tutor'),
    ('d0d0d0d0-0000-4000-8000-000000000202'::uuid, 'tutor'),
    ('d0d0d0d0-0000-4000-8000-000000000203'::uuid, 'tutor')
  ) as v(user_id, role_code)
  join roles r on r.code = v.role_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Students (minor data — demo children only)
-- ---------------------------------------------------------------------------
insert into students (id, owner_user_id, full_name, stage_id, grade, is_minor, notes) values
  ('d0d0d0d0-0000-4000-8000-000000000301', 'd0d0d0d0-0000-4000-8000-000000000101',
   'Zahraa', (select id from educational_stages where code = 'primary'), 'Grade 5', true, 'تحتاج تقوية في الرياضيات'),
  ('d0d0d0d0-0000-4000-8000-000000000302', 'd0d0d0d0-0000-4000-8000-000000000101',
   'Hussain', (select id from educational_stages where code = 'secondary'), 'Grade 11', true, 'تحضير لامتحان الفيزياء'),
  ('d0d0d0d0-0000-4000-8000-000000000303', 'd0d0d0d0-0000-4000-8000-000000000102',
   'Maryam', (select id from educational_stages where code = 'intermediate'), 'Grade 9', true, NULL)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tutor profiles: one listed, one with an expired subscription (must NOT appear
-- in search), one still pending review. This is what makes the visibility rules
-- observable in a preview deployment.
-- ---------------------------------------------------------------------------
insert into tutors (id, user_id, slug, status, headline_ar, headline_en, bio_ar, bio_en,
                    qualification, university, major, graduation_year, years_experience,
                    price_per_hour, teaches_home, teaches_online, gender, area_id,
                    languages, submitted_at, reviewed_at, approved_at, admin_notes) values
  ('d0d0d0d0-0000-4000-8000-000000000401', 'd0d0d0d0-0000-4000-8000-000000000201', 'demo-tutor-ahmed',
   'approved',
   'معلم رياضيات للمرحلتين الإعدادية والثانوية',
   'Mathematics tutor for intermediate and secondary stages',
   'خريج كلية المعلمين بجامعة البحرين، خبرة سبع سنوات في تدريس الرياضيات للمرحلتين الإعدادية والثانوية، مع متابعة أسبوعية لتقارير الطالب مع ولي الأمر.',
   'Graduate of the Bahrain Teachers College, seven years teaching mathematics at intermediate and secondary level, with weekly progress reports to parents.',
   'بكالوريوس تربية - رياضيات', 'جامعة البحرين', 'الرياضيات', 2018, 7,
   8.500, true, true, 'male', (select id from areas where code = 'rifa'),
   array['ar','en'], now() - interval '20 days', now() - interval '18 days', now() - interval '18 days',
   'DEMO DATA — created by drizzle/0002_demo_seed.sql'),

  ('d0d0d0d0-0000-4000-8000-000000000402', 'd0d0d0d0-0000-4000-8000-000000000202', 'demo-tutor-mariam',
   'approved',
   'معلمة لغة إنجليزية وعلوم للمرحلة الابتدائية',
   'English and science tutor for the primary stage',
   'معلمة لغة إنجليزية بخبرة في المناهج البحرينية، تركيز على القراءة والمهارات الأساسية للأطفال من الصف الأول إلى السادس.',
   'English teacher experienced with the Bahraini curriculum, focused on reading and core skills for children in grades one to six.',
   'بكالوريوس آداب - لغة إنجليزية', 'جامعة البحرين', 'اللغة الإنجليزية', 2020, 5,
   6.000, true, true, 'female', (select id from areas where code = 'manama'),
   array['ar','en'], now() - interval '40 days', now() - interval '35 days', now() - interval '35 days',
   'DEMO DATA — subscription intentionally expired to demonstrate the listing rule'),

  ('d0d0d0d0-0000-4000-8000-000000000403', 'd0d0d0d0-0000-4000-8000-000000000203', 'demo-tutor-yusuf',
   'pending',
   'معلم فيزياء وكيمياء للمرحلة الثانوية',
   'Physics and chemistry tutor for the secondary stage',
   'خريج تربية تخصص فيزياء، خبرة خمس سنوات في المدارس الخاصة في البحرين وتحضير الطلبة لامتحانات الثانوية العامة.',
   'Physics and chemistry teacher with five years in Bahraini private schools, preparing students for secondary examinations.',
   'بكالوريوس تربية - فيزياء', 'جامعة الخليج العربي', 'الفيزياء', 2021, 5,
   9.000, false, true, 'male', (select id from areas where code = 'isa_town'),
   array['ar'], now() - interval '2 days', NULL, NULL,
   'DEMO DATA — awaiting review, intentionally NOT listed')
on conflict (id) do nothing;

insert into tutor_subjects (tutor_id, subject_id)
select v.tutor_id, s.id
  from (values
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'math'),
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'physics'),
    ('d0d0d0d0-0000-4000-8000-000000000402'::uuid, 'english'),
    ('d0d0d0d0-0000-4000-8000-000000000402'::uuid, 'science'),
    ('d0d0d0d0-0000-4000-8000-000000000403'::uuid, 'physics'),
    ('d0d0d0d0-0000-4000-8000-000000000403'::uuid, 'chemistry')
  ) as v(tutor_id, code)
  join subjects s on s.code = v.code
on conflict do nothing;

insert into tutor_stages (tutor_id, stage_id)
select v.tutor_id, st.id
  from (values
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'intermediate'),
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'secondary'),
    ('d0d0d0d0-0000-4000-8000-000000000402'::uuid, 'primary'),
    ('d0d0d0d0-0000-4000-8000-000000000403'::uuid, 'secondary')
  ) as v(tutor_id, code)
  join educational_stages st on st.code = v.code
on conflict do nothing;

insert into tutor_areas (tutor_id, area_id)
select v.tutor_id, a.id
  from (values
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'rifa'),
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'isa_town'),
    ('d0d0d0d0-0000-4000-8000-000000000401'::uuid, 'hamad_town'),
    ('d0d0d0d0-0000-4000-8000-000000000402'::uuid, 'manama'),
    ('d0d0d0d0-0000-4000-8000-000000000402'::uuid, 'juffair')
  ) as v(tutor_id, code)
  join areas a on a.code = v.code
on conflict do nothing;

-- Weekly availability: Sunday..Thursday evenings, plus Friday morning for one.
insert into tutor_availability (tutor_id, weekday, start_time, end_time, method) values
  ('d0d0d0d0-0000-4000-8000-000000000401', 0, '16:00', '20:00', 'home'),
  ('d0d0d0d0-0000-4000-8000-000000000401', 1, '16:00', '20:00', 'home'),
  ('d0d0d0d0-0000-4000-8000-000000000401', 2, '16:00', '20:00', 'online'),
  ('d0d0d0d0-0000-4000-8000-000000000401', 3, '16:00', '20:00', NULL),
  ('d0d0d0d0-0000-4000-8000-000000000401', 4, '16:00', '20:00', NULL),
  ('d0d0d0d0-0000-4000-8000-000000000402', 0, '15:00', '18:00', 'home'),
  ('d0d0d0d0-0000-4000-8000-000000000402', 2, '15:00', '18:00', 'home'),
  ('d0d0d0d0-0000-4000-8000-000000000402', 4, '10:00', '13:00', 'online'),
  ('d0d0d0d0-0000-4000-8000-000000000403', 5, '09:00', '12:00', 'online')
on conflict do nothing;

-- Subscriptions: tutor 1 active (listed), tutor 2 expired (hidden), tutor 3 none.
insert into subscriptions (id, tutor_id, plan_id, status, price, starts_at, expires_at, grace_until)
select 'd0d0d0d0-0000-4000-8000-000000000501'::uuid, 'd0d0d0d0-0000-4000-8000-000000000401'::uuid,
       p.id, 'active', p.price, now() - interval '5 days',
       now() + interval '25 days', now() + interval '28 days'
  from subscription_plans p where p.code = 'monthly'
on conflict (id) do nothing;

insert into subscriptions (id, tutor_id, plan_id, status, price, starts_at, expires_at, grace_until)
select 'd0d0d0d0-0000-4000-8000-000000000502'::uuid, 'd0d0d0d0-0000-4000-8000-000000000402'::uuid,
       p.id, 'expired', p.price, now() - interval '70 days',
       now() - interval '40 days', now() - interval '37 days'
  from subscription_plans p where p.code = 'monthly'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Bookings in three different states, with the matching payment records.
-- Dates are relative to today so the demo never looks stale.
-- ---------------------------------------------------------------------------
insert into bookings (id, code, tutor_id, student_id, customer_user_id, subject_id, stage_id,
                      lesson_type_id, method, scheduled_date, start_time, duration_minutes,
                      area_id, address_note, price_per_hour, price, status, customer_notes) values
  ('d0d0d0d0-0000-4000-8000-000000000601', 'EDU-DEMO-0001',
   'd0d0d0d0-0000-4000-8000-000000000401', 'd0d0d0d0-0000-4000-8000-000000000301',
   'd0d0d0d0-0000-4000-8000-000000000101',
   (select id from subjects where code = 'math'),
   (select id from educational_stages where code = 'primary'),
   (select id from lesson_types where code = 'private'),
   'home', current_date + 3, '17:00', 60,
   (select id from areas where code = 'rifa'), 'مجمع 902، بيت 12',
   8.500, 8.500, 'pending_payment', 'نحتاج تركيزًا على الكسور.'),

  ('d0d0d0d0-0000-4000-8000-000000000602', 'EDU-DEMO-0002',
   'd0d0d0d0-0000-4000-8000-000000000401', 'd0d0d0d0-0000-4000-8000-000000000302',
   'd0d0d0d0-0000-4000-8000-000000000101',
   (select id from subjects where code = 'physics'),
   (select id from educational_stages where code = 'secondary'),
   (select id from lesson_types where code = 'exam_prep'),
   'online', current_date + 5, '18:30', 90,
   NULL, NULL,
   8.500, 11.900, 'confirmed', 'مراجعة شاملة قبل الامتحان.'),

  ('d0d0d0d0-0000-4000-8000-000000000603', 'EDU-DEMO-0003',
   'd0d0d0d0-0000-4000-8000-000000000401', 'd0d0d0d0-0000-4000-8000-000000000302',
   'd0d0d0d0-0000-4000-8000-000000000101',
   (select id from subjects where code = 'physics'),
   (select id from educational_stages where code = 'secondary'),
   (select id from lesson_types where code = 'revision'),
   'online', current_date - 4, '19:00', 60,
   NULL, NULL,
   8.500, 8.500, 'completed', 'حتاج حل مسائل الحركة.'),

  ('d0d0d0d0-0000-4000-8000-000000000604', 'EDU-DEMO-0004',
   'd0d0d0d0-0000-4000-8000-000000000402', 'd0d0d0d0-0000-4000-8000-000000000303',
   'd0d0d0d0-0000-4000-8000-000000000102',
   (select id from subjects where code = 'english'),
   (select id from educational_stages where code = 'intermediate'),
   (select id from lesson_types where code = 'private'),
   'home', current_date - 9, '16:00', 60,
   (select id from areas where code = 'juffair'), 'مجمع 205، شقة 4',
   6.000, 6.000, 'completed', 'Reading comprehension practice.')
on conflict (id) do nothing;

-- The completed bookings carry the extra timestamps their state implies.
update bookings
   set confirmed_at = created_at + interval '2 hours',
       completed_at = (scheduled_date + start_time) + make_interval(mins => duration_minutes)
 where id in ('d0d0d0d0-0000-4000-8000-000000000602', 'd0d0d0d0-0000-4000-8000-000000000603', 'd0d0d0d0-0000-4000-8000-000000000604');

insert into booking_items (booking_id, kind, quantity, unit_price, amount)
select id, 'lesson', 1, price, price from bookings where code like 'EDU-DEMO-%'
on conflict do nothing;

insert into payments (id, reference_code, subject_type, booking_id, payer_user_id, amount, method, status,
                      customer_reference, verified_at)
select 'd0d0d0d0-0000-4000-8000-000000000701'::uuid, 'PAY-EDU-DEMO-0002', 'booking',
       'd0d0d0d0-0000-4000-8000-000000000602'::uuid, 'd0d0d0d0-0000-4000-8000-000000000101'::uuid,
       price, 'benefitpay', 'verified', 'BEN-4471902', now() - interval '4 days'
  from bookings where id = 'd0d0d0d0-0000-4000-8000-000000000602'
on conflict (id) do nothing;

insert into payments (id, reference_code, subject_type, booking_id, payer_user_id, amount, method, status,
                      customer_reference, verified_at)
select 'd0d0d0d0-0000-4000-8000-000000000702'::uuid, 'PAY-EDU-DEMO-0003', 'booking',
       'd0d0d0d0-0000-4000-8000-000000000603'::uuid, 'd0d0d0d0-0000-4000-8000-000000000101'::uuid,
       price, 'benefitpay', 'verified', 'BEN-4471655', now() - interval '5 days'
  from bookings where id = 'd0d0d0d0-0000-4000-8000-000000000603'
on conflict (id) do nothing;

insert into payments (id, reference_code, subject_type, booking_id, payer_user_id, amount, method, status)
select 'd0d0d0d0-0000-4000-8000-000000000703'::uuid, 'PAY-EDU-DEMO-0001', 'booking',
       'd0d0d0d0-0000-4000-8000-000000000601'::uuid, 'd0d0d0d0-0000-4000-8000-000000000101'::uuid,
       price, 'benefitpay', 'pending'
  from bookings where id = 'd0d0d0d0-0000-4000-8000-000000000601'
on conflict (id) do nothing;

-- One published review, and the tutor's aggregate recomputed from it, so the
-- profile shows a rating that a real review explains.
insert into reviews (id, booking_id, tutor_id, author_user_id, rating, comment, status, moderated_at)
values ('d0d0d0d0-0000-4000-8000-000000000801', 'd0d0d0d0-0000-4000-8000-000000000603',
        'd0d0d0d0-0000-4000-8000-000000000401', 'd0d0d0d0-0000-4000-8000-000000000101',
        5, 'شرح واضح ومسائل مرتبة، وتابعت التقدم مع ابني أسبوعيًا.', 'published', now() - interval '3 days')
on conflict (id) do nothing;

update tutors t
   set rating_avg = agg.avg, rating_count = agg.cnt, completed_lessons = agg.lessons
  from (
    select b.tutor_id,
           coalesce((select round(avg(rating), 2) from reviews r where r.tutor_id = b.tutor_id and r.status = 'published'), 0) as avg,
           (select count(*) from reviews r where r.tutor_id = b.tutor_id and r.status = 'published') as cnt,
           count(*) filter (where b.status = 'completed') as lessons
      from bookings b where b.code like 'EDU-DEMO-%'
     group by b.tutor_id
  ) agg
 where t.id = agg.tutor_id;

-- A lesson reminder is NOT seeded: notifications are produced by the platform
-- (see /api/cron/reminders), and seeding them would fake platform activity.
