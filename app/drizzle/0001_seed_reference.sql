-- ============================================================================
-- EDURA — reference data (idempotent)
--
-- This is the data the platform cannot run without: the RBAC matrix, the
-- education catalogue, lesson types, subscription plans and the platform
-- settings row. Everything here is ADMIN-EDITABLE afterwards (§28, §41) — the
-- seed exists so a fresh deployment is usable, not to hard-code business rules.
--
-- Safe to run repeatedly: every insert is guarded by an ON CONFLICT clause.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
-- generated from src/lib/security/rbac.ts (source of truth).
insert into roles (code, name_ar, name_en, description) values
  ('super_admin', 'مدير عام', 'Super admin', 'Full access, including role management'),
  ('admin', 'مدير', 'Admin', 'Every operational permission except role management'),
  ('moderator', 'مشرف', 'Moderator', 'Reviews, restrictions and document review'),
  ('support', 'دعم', 'Support', 'Read access plus notifications')
on conflict (code) do nothing;

insert into permissions (code, description) values
  ('overview.read', 'overview.read'),
  ('tutor.read', 'tutor.read'),
  ('tutor.approve', 'tutor.approve'),
  ('tutor.reject', 'tutor.reject'),
  ('tutor.suspend', 'tutor.suspend'),
  ('tutor.edit', 'tutor.edit'),
  ('tutor.document.read', 'tutor.document.read'),
  ('user.read', 'user.read'),
  ('user.restrict', 'user.restrict'),
  ('user.ban', 'user.ban'),
  ('booking.read', 'booking.read'),
  ('booking.update', 'booking.update'),
  ('booking.cancel', 'booking.cancel'),
  ('payment.read', 'payment.read'),
  ('payment.verify', 'payment.verify'),
  ('payment.refund', 'payment.refund'),
  ('subscription.manage', 'subscription.manage'),
  ('review.read', 'review.read'),
  ('review.moderate', 'review.moderate'),
  ('notification.send', 'notification.send'),
  ('catalog.manage', 'catalog.manage'),
  ('plan.manage', 'plan.manage'),
  ('cms.manage', 'cms.manage'),
  ('settings.manage', 'settings.manage'),
  ('role.manage', 'role.manage'),
  ('audit.read', 'audit.read')
on conflict (code) do nothing;

-- role -> permission mapping, mirrored one-to-one from ROLE_PERMISSIONS
insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('super_admin', 'overview.read'),
  ('super_admin', 'tutor.read'),
  ('super_admin', 'tutor.approve'),
  ('super_admin', 'tutor.reject'),
  ('super_admin', 'tutor.suspend'),
  ('super_admin', 'tutor.edit'),
  ('super_admin', 'tutor.document.read'),
  ('super_admin', 'user.read'),
  ('super_admin', 'user.restrict'),
  ('super_admin', 'user.ban'),
  ('super_admin', 'booking.read'),
  ('super_admin', 'booking.update'),
  ('super_admin', 'booking.cancel'),
  ('super_admin', 'payment.read'),
  ('super_admin', 'payment.verify'),
  ('super_admin', 'payment.refund'),
  ('super_admin', 'subscription.manage'),
  ('super_admin', 'review.read'),
  ('super_admin', 'review.moderate'),
  ('super_admin', 'notification.send'),
  ('super_admin', 'catalog.manage'),
  ('super_admin', 'plan.manage'),
  ('super_admin', 'cms.manage'),
  ('super_admin', 'settings.manage'),
  ('super_admin', 'role.manage'),
  ('super_admin', 'audit.read'),
  ('admin', 'overview.read'),
  ('admin', 'tutor.read'),
  ('admin', 'tutor.approve'),
  ('admin', 'tutor.reject'),
  ('admin', 'tutor.suspend'),
  ('admin', 'tutor.edit'),
  ('admin', 'tutor.document.read'),
  ('admin', 'user.read'),
  ('admin', 'user.restrict'),
  ('admin', 'user.ban'),
  ('admin', 'booking.read'),
  ('admin', 'booking.update'),
  ('admin', 'booking.cancel'),
  ('admin', 'payment.read'),
  ('admin', 'payment.verify'),
  ('admin', 'payment.refund'),
  ('admin', 'subscription.manage'),
  ('admin', 'review.read'),
  ('admin', 'review.moderate'),
  ('admin', 'notification.send'),
  ('admin', 'catalog.manage'),
  ('admin', 'plan.manage'),
  ('admin', 'cms.manage'),
  ('admin', 'settings.manage'),
  ('admin', 'audit.read'),
  ('moderator', 'overview.read'),
  ('moderator', 'tutor.read'),
  ('moderator', 'tutor.document.read'),
  ('moderator', 'user.read'),
  ('moderator', 'user.restrict'),
  ('moderator', 'booking.read'),
  ('moderator', 'review.read'),
  ('moderator', 'review.moderate'),
  ('moderator', 'notification.send'),
  ('moderator', 'audit.read'),
  ('support', 'overview.read'),
  ('support', 'tutor.read'),
  ('support', 'user.read'),
  ('support', 'booking.read'),
  ('support', 'payment.read'),
  ('support', 'review.read'),
  ('support', 'notification.send')
) as m(role_code, permission_code)
join roles r on r.code = m.role_code
join permissions p on p.code = m.permission_code
on conflict do nothing;
-- counts: roles 4 permissions 26 mappings 68

-- ---------------------------------------------------------------------------
-- Education catalogue (§2, §28)
-- ---------------------------------------------------------------------------
insert into educational_stages (code, name_ar, name_en, sort_order) values
  ('primary',      'المرحلة الابتدائية',   'Primary',     1),
  ('intermediate', 'المرحلة الإعدادية',    'Intermediate', 2),
  ('secondary',    'المرحلة الثانوية',     'Secondary',   3)
on conflict (code) do nothing;

insert into subjects (code, name_ar, name_en, sort_order) values
  ('math',     'الرياضيات',            'Mathematics',      1),
  ('arabic',   'اللغة العربية',        'Arabic',           2),
  ('english',  'اللغة الإنجليزية',     'English',          3),
  ('science',  'العلوم',               'Science',          4),
  ('physics',  'الفيزياء',             'Physics',          5),
  ('chemistry','الكيمياء',             'Chemistry',        6),
  ('biology',  'الأحياء',              'Biology',          7),
  ('social',   'الدراسات الاجتماعية',  'Social Studies',   8),
  ('cs',       'علوم الحاسوب',         'Computer Science', 9),
  ('islamic',  'التربية الإسلامية',    'Islamic Studies', 10),
  ('other',    'مواد أخرى',            'Other',           99)
on conflict (code) do nothing;

-- Areas are Bahrain-focused and ADMIN-EDITABLE: this is a starting set, not a
-- closed list (§43). Governorate names come from the official four.
insert into areas (code, name_ar, name_en, governorate, sort_order) values
  ('manama',     'المنامة',        'Manama',        'capital',    1),
  ('juffair',    'الجفير',         'Juffair',       'capital',    2),
  ('hidd',       'الحد',           'Hidd',          'capital',    3),
  ('muharraq',   'المحرق',         'Muharraq',      'muharraq',   4),
  ('busaiteen',  'البسيتين',       'Busaiteen',     'muharraq',   5),
  ('rifa',       'الرفاع',         'Riffa',         'southern',   6),
  ('isa_town',   'مدينة عيسى',     'Isa Town',      'southern',   7),
  ('hamad_town', 'مدينة حمد',      'Hamad Town',    'southern',   8),
  ('zallaq',     'الزلاق',         'Zallaq',        'southern',   9),
  ('sitrah',     'سترة',           'Sitrah',        'capital',   10),
  ('budaiya',    'البديع',         'Budaiya',       'northern',  11),
  ('saar',       'سار',            'Saar',          'northern',  12),
  ('ali',        'عالي',           'A''ali',        'northern',  13),
  ('jidd_hafs',  'جدة حفص',        'Jidd Hafs',     'northern',  14)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Lesson types (§10) — the price multiplier and duration the booking engine reads
-- ---------------------------------------------------------------------------
insert into lesson_types (code, name_ar, name_en, default_duration, price_multiplier, max_students, sort_order) values
  ('private',   'حصة خاصة',            'Private lesson',      60, 1.000, 1, 1),
  ('intensive', 'دورة مكثفة',          'Intensive course',    90, 1.500, 1, 2),
  ('exam_prep', 'تحضير للامتحانات',    'Exam preparation',    90, 1.400, 1, 3),
  ('revision',  'مراجعة مادة',         'Subject revision',    60, 1.100, 1, 4),
  ('group',     'مجموعة صغيرة',        'Small group',         60, 0.700, 4, 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Subscription plans (§3, §37) — pricing is a business decision, editable in
-- the console; these are launch defaults in BHD.
-- ---------------------------------------------------------------------------
insert into subscription_plans (code, name_ar, name_en, price, interval, duration_days, grace_days, features, sort_order) values
  ('monthly', 'خطة شهرية', 'Monthly', 15.000, 'monthly', 30, 3,
   '["الظهور في نتائج البحث","صفحة معلم كاملة","طلبات حجز غير محدودة","دعم عبر واتساب"]'::jsonb, 1),
  ('annual',  'خطة سنوية', 'Annual', 150.000, 'annual', 365, 7,
   '["كل مزايا الخطة الشهرية","شهران مجانًا","أولوية في الترتيب","مراجعة المستندات بسرعة"]'::jsonb, 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Platform settings (§41) — one row the admin console edits. Values mirror the
-- defaults in src/lib/settings.ts so a fresh database behaves exactly like an
-- unconfigured deployment.
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('platform', '{
     "platformNameAr": "إديورا",
     "platformNameEn": "Edura",
     "whatsappNumber": "+97366661238",
     "benefitPayNumber": "+97366661238",
     "supportEmail": "support@edura.bh",
     "supportPhone": "+97366661238",
     "currency": "BHD",
     "cancellationHours": 24,
     "minLeadTimeHours": 12,
     "maxAdvanceDays": 60,
     "reviewModeration": true,
     "allowTutorDecline": true,
     "guaranteeEnabled": true,
     "guaranteeClaimWindowHours": 48,
     "guaranteeMaxCompletedSessions": 1,
     "guaranteeReplacementSessions": 1
   }'::jsonb)
on conflict (key) do nothing;

-- CMS content starts EMPTY on purpose: an empty row means "use the reviewed
-- dictionary default", which is a complete, reviewed page — never a blank one.
insert into settings (key, value) values ('cms', '{}'::jsonb)
on conflict (key) do nothing;
