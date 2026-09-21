-- EDURA - initial schema (source of truth for the database).
-- Target: PostgreSQL 15+ (Supabase compatible). Applied with psql in a single
-- transaction; every statement is idempotent-safe by being ordered and typed.
--
-- Design rules honoured here:
--  * UUID primary keys, created_at/updated_at on every mutable table.
--  * Money is numeric(12,3) - BHD is a 3-decimal currency, never floating point.
--  * Booking conflicts are prevented BY THE DATABASE (btree_gist exclusion
--    constraint on (tutor_id, slot) for reservation-holding statuses), not only
--    in application code - see BOOKINGS below.
--  * Minor (student) data is a separate table with its own access path.
--  * Everything admin-editable (subjects, stages, areas, lesson types, pricing,
--    policies) lives in tables/settings, never hard-coded.

create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists btree_gist;   -- EXCLUDE constraints on (uuid, range)

-- ---------------------------------------------------------------------------
-- Enumerated domains
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role_kind as enum ('student', 'parent', 'tutor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('active', 'restricted', 'suspended', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tutor_status as enum ('pending', 'under_review', 'approved', 'rejected', 'suspended', 'expired_subscription');
exception when duplicate_object then null; end $$;

do $$ begin
  create type teaching_method as enum ('home', 'online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum (
    'pending_payment', 'payment_verification', 'paid', 'confirmed',
    'tutor_accepted', 'scheduled', 'in_progress', 'completed',
    'cancelled', 'rejected', 'refund_requested', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'submitted', 'verified', 'rejected', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('benefitpay', 'bank_transfer', 'cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_subject as enum ('booking', 'subscription');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proof_source as enum ('in_platform', 'whatsapp_external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('pending', 'active', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('pending', 'published', 'hidden', 'reported');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_kind as enum ('identity', 'degree', 'certificate', 'experience', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_status as enum ('uploaded', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('in_app', 'email', 'whatsapp', 'sms', 'push');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Identity, roles, permissions
-- ---------------------------------------------------------------------------
create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  email_normalized  text generated always as (lower(email)) stored,
  phone             text not null,
  password_hash     text not null,
  primary_role      user_role_kind not null default 'student',
  status            user_status not null default 'active',
  locale            text not null default 'ar' check (locale in ('ar', 'en')),
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  mfa_secret        text,                       -- admins only (TOTP, base32)
  mfa_enabled       boolean not null default false,
  last_login_at     timestamptz,
  failed_logins     integer not null default 0,
  locked_until      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists users_email_key on users (email_normalized) where deleted_at is null;
create unique index if not exists users_phone_key on users (phone) where deleted_at is null;
create index if not exists users_role_status_idx on users (primary_role, status);

create table if not exists user_profiles (
  user_id            uuid primary key references users(id) on delete cascade,
  full_name          text not null,
  full_name_ar       text,
  display_name       text,
  avatar_url         text,
  area_id            uuid,
  preferred_locale   text not null default 'ar' check (preferred_locale in ('ar', 'en')),
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name_ar     text not null,
  name_en     text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  description text not null,
  created_at  timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists user_roles (
  user_id     uuid not null references users(id) on delete cascade,
  role_id     uuid not null references roles(id) on delete cascade,
  granted_by  uuid references users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- DB-backed sessions (opaque cookie value = random id; only its SHA-256 is
-- stored, so a database leak cannot be replayed as a live session).
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null unique,
  kind         text not null default 'user' check (kind in ('user', 'admin')),
  mfa_verified boolean not null default false,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id, expires_at desc);

-- Fixed-window rate limiting. DB-backed so limits hold across serverless
-- instances (an in-process memory counter is per-instance and therefore useless
-- on Vercel).
create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- Reference data (admin-editable, never hard-coded in application code)
-- ---------------------------------------------------------------------------
create table if not exists educational_stages (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name_ar    text not null,
  name_en    text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name_ar    text not null,
  name_en    text not null,
  icon       text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists areas (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name_ar     text not null,
  name_en     text not null,
  governorate text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists lesson_types (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name_ar          text not null,
  name_en          text not null,
  description_ar   text,
  description_en   text,
  default_duration integer not null default 60 check (default_duration between 30 and 240),
  -- v1 pricing = tutor price per hour x multiplier (admin-controlled).
  price_multiplier numeric(5,3) not null default 1.000 check (price_multiplier > 0),
  max_students     integer not null default 1 check (max_students >= 1),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table user_profiles
  drop constraint if exists user_profiles_area_fk;
alter table user_profiles
  add constraint user_profiles_area_fk foreign key (area_id) references areas(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Learners (students) - a distinct sensitive category (minors), access
-- controlled separately from the owner account's own PII.
-- ---------------------------------------------------------------------------
create table if not exists students (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users(id) on delete cascade,
  full_name      text not null,
  stage_id       uuid references educational_stages(id) on delete set null,
  grade          text,
  gender         text check (gender in ('male', 'female') or gender is null),
  birth_year     integer check (birth_year between 1990 and 2100 or birth_year is null),
  is_minor       boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists students_owner_idx on students (owner_user_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Tutors
-- ---------------------------------------------------------------------------
create table if not exists tutors (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references users(id) on delete cascade,
  -- SEO-friendly public URL segment, assigned when the profile is approved:
  -- /ar/tutors/<slug>. Derived from the name where it can be transliterated,
  -- otherwise from the short id, and never reused.
  slug              text unique,
  status            tutor_status not null default 'pending',
  headline_ar       text,
  headline_en       text,
  bio_ar            text,
  bio_en            text,
  qualification     text,
  university        text,
  major             text,
  graduation_year   integer check (graduation_year between 1950 and 2100 or graduation_year is null),
  years_experience  integer not null default 0 check (years_experience between 0 and 60),
  price_per_hour    numeric(12,3) not null check (price_per_hour > 0 and price_per_hour <= 1000),
  currency          text not null default 'BHD' check (currency = 'BHD'),
  teaches_home      boolean not null default false,
  teaches_online    boolean not null default true,
  gender            text check (gender in ('male', 'female') or gender is null),
  area_id           uuid references areas(id) on delete set null,
  languages         text[] not null default array['ar']::text[],
  rating_avg        numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count      integer not null default 0,
  completed_lessons integer not null default 0,
  admin_notes       text,
  rejection_reason  text,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references users(id) on delete set null,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
-- The public listing path reads exactly this predicate.
create index if not exists tutors_public_idx on tutors (status, area_id, price_per_hour)
  where deleted_at is null;
create index if not exists tutors_status_idx on tutors (status);

create table if not exists tutor_subjects (
  tutor_id    uuid not null references tutors(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  -- optional per-subject pricing; null = fall back to tutors.price_per_hour
  price_override numeric(12,3) check (price_override is null or price_override > 0),
  primary key (tutor_id, subject_id)
);

create table if not exists tutor_stages (
  tutor_id  uuid not null references tutors(id) on delete cascade,
  stage_id  uuid not null references educational_stages(id) on delete cascade,
  primary key (tutor_id, stage_id)
);

create table if not exists tutor_areas (
  tutor_id uuid not null references tutors(id) on delete cascade,
  area_id  uuid not null references areas(id) on delete cascade,
  primary key (tutor_id, area_id)
);

-- Recurring weekly availability template. Concrete bookings are matched against
-- this server-side; the client calendar is never trusted (§23).
create table if not exists tutor_availability (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references tutors(id) on delete cascade,
  weekday    integer not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  end_time   time not null,
  method     teaching_method,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists tutor_availability_tutor_idx on tutor_availability (tutor_id, weekday);

-- Date-specific blocks (holidays, one-off unavailability).
create table if not exists tutor_time_off (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references tutors(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists tutor_time_off_idx on tutor_time_off (tutor_id, starts_at, ends_at);

-- Supporting documents. NEVER publicly readable: stored behind a private
-- bucket, retrieved only through short-lived signed URLs, every access audited.
create table if not exists tutor_documents (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id) on delete cascade,
  kind         document_kind not null,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status       document_status not null default 'uploaded',
  reviewed_by  uuid references users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (storage_path)
);
create index if not exists tutor_documents_tutor_idx on tutor_documents (tutor_id, kind);

-- ---------------------------------------------------------------------------
-- Subscriptions (v1: manual BenefitPay, admin-verified - no fake billing)
-- ---------------------------------------------------------------------------
create table if not exists subscription_plans (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name_ar      text not null,
  name_en      text not null,
  price        numeric(12,3) not null check (price >= 0),
  currency     text not null default 'BHD' check (currency = 'BHD'),
  interval     text not null check (interval in ('monthly', 'annual')),
  duration_days integer not null check (duration_days between 1 and 730),
  grace_days   integer not null default 0 check (grace_days between 0 and 90),
  features     jsonb not null default '[]'::jsonb,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references tutors(id) on delete cascade,
  plan_id     uuid not null references subscription_plans(id) on delete restrict,
  status      subscription_status not null default 'pending',
  starts_at   timestamptz,
  expires_at  timestamptz,
  grace_until timestamptz,
  price       numeric(12,3) not null check (price >= 0),
  currency    text not null default 'BHD',
  created_by  uuid references users(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index if not exists subscriptions_tutor_idx on subscriptions (tutor_id, status, expires_at desc);

-- ---------------------------------------------------------------------------
-- Booking code allocation: EDU-DDMMYYYY-XXXX with a per-day sequence.
-- Done in SQL so two concurrent requests can never take the same number.
-- ---------------------------------------------------------------------------
create table if not exists booking_code_counters (
  day        date primary key,
  last_value integer not null default 0
);

create or replace function next_booking_code(p_day date)
returns text
language plpgsql
as $$
declare
  v_seq integer;
begin
  insert into booking_code_counters (day, last_value)
  values (p_day, 1)
  on conflict (day) do update set last_value = booking_code_counters.last_value + 1
  returning last_value into v_seq;

  return 'EDU-' || to_char(p_day, 'DDMMYYYY') || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  tutor_id         uuid not null references tutors(id) on delete restrict,
  student_id       uuid not null references students(id) on delete restrict,
  -- the account that booked (student or parent); always the session user
  customer_user_id uuid not null references users(id) on delete restrict,
  subject_id       uuid not null references subjects(id) on delete restrict,
  stage_id         uuid references educational_stages(id) on delete set null,
  lesson_type_id   uuid not null references lesson_types(id) on delete restrict,
  method           teaching_method not null,
  scheduled_date   date not null,
  start_time       time not null,
  duration_minutes integer not null check (duration_minutes between 30 and 240),
  -- derived by trigger (kept as real columns so the exclusion constraint below
  -- can index them; a generated column would need an immutable expression)
  starts_at        timestamp not null,
  ends_at          timestamp not null,
  timezone         text not null default 'Asia/Bahrain',
  area_id          uuid references areas(id) on delete set null,
  address_note     text,
  zoom_url         text,
  price_per_hour   numeric(12,3) not null check (price_per_hour > 0),
  price            numeric(12,3) not null check (price >= 0),
  currency         text not null default 'BHD' check (currency = 'BHD'),
  status           booking_status not null default 'pending_payment',
  customer_notes   text,
  admin_notes      text,
  idempotency_key  text,
  confirmed_at     timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     uuid references users(id) on delete set null,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  check (scheduled_date is not null)
);

-- CONFLICT PREVENTION AT THE DATABASE LEVEL (§12, §24).
-- A tutor can never hold two overlapping reservations. The partial predicate
-- means cancelled/rejected/refunded bookings do not block a slot, while every
-- reservation-holding status does. Enforced by the index itself, so it holds
-- for two truly simultaneous transactions - the second one blocks on the index
-- and then fails with SQLSTATE 23P01 (exclusion_violation).
do $$ begin
  alter table bookings drop constraint if exists bookings_no_tutor_overlap;
  alter table bookings add constraint bookings_no_tutor_overlap
    exclude using gist (
      tutor_id with =,
      tsrange(starts_at, ends_at) with &&
    ) where (status in ('pending_payment', 'payment_verification', 'paid', 'confirmed',
                        'tutor_accepted', 'scheduled', 'in_progress'));
exception when undefined_object then null; when duplicate_table then null; end $$;

create index if not exists bookings_tutor_date_idx on bookings (tutor_id, scheduled_date, start_time);
create index if not exists bookings_customer_idx on bookings (customer_user_id, created_at desc);
create index if not exists bookings_status_idx on bookings (status, created_at desc);
create unique index if not exists bookings_idempotency_key on bookings (idempotency_key)
  where idempotency_key is not null;

-- keep starts_at/ends_at derived (cannot drift, cannot be set by a client)
create or replace function bookings_sync_slot() returns trigger
language plpgsql
as $$
begin
  new.starts_at := new.scheduled_date + new.start_time;
  new.ends_at   := new.starts_at + make_interval(mins => new.duration_minutes);
  return new;
end $$;

drop trigger if exists bookings_sync_slot_trg on bookings;
create trigger bookings_sync_slot_trg
  before insert or update of scheduled_date, start_time, duration_minutes
  on bookings for each row execute function bookings_sync_slot();

-- Line items: v1 writes one item per booking; the shape is kept so a future
-- small-group / multi-subject booking needs no schema change (§14).
create table if not exists booking_items (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  kind             text not null default 'lesson' check (kind in ('lesson', 'addon', 'discount')),
  description_ar   text,
  description_en   text,
  quantity         integer not null default 1 check (quantity > 0),
  unit_price       numeric(12,3) not null,
  amount           numeric(12,3) not null,
  created_at       timestamptz not null default now()
);
create index if not exists booking_items_booking_idx on booking_items (booking_id);

-- ---------------------------------------------------------------------------
-- Payments (v1: manual BenefitPay verified by an admin). Records what actually
-- happened - including proofs that arrived outside the platform.
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  reference_code   text not null unique,
  subject_type     payment_subject not null,
  booking_id       uuid references bookings(id) on delete restrict,
  subscription_id  uuid references subscriptions(id) on delete restrict,
  payer_user_id    uuid references users(id) on delete set null,
  amount           numeric(12,3) not null check (amount >= 0),
  currency         text not null default 'BHD' check (currency = 'BHD'),
  method           payment_method not null default 'benefitpay',
  status           payment_status not null default 'pending',
  customer_reference text,
  verified_by      uuid references users(id) on delete set null,
  verified_at      timestamptz,
  rejection_reason text,
  admin_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((subject_type = 'booking') = (booking_id is not null)),
  check ((subject_type = 'subscription') = (subscription_id is not null))
);
create index if not exists payments_status_idx on payments (status, created_at desc);
create index if not exists payments_booking_idx on payments (booking_id);

create table if not exists payment_proofs (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete cascade,
  source       proof_source not null,
  -- in-platform proofs live in a PRIVATE bucket and are read only through
  -- short-lived signed URLs; externally received proofs have no path at all
  storage_path text,
  mime_type    text,
  size_bytes   integer,
  received_note text,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((source = 'in_platform') = (storage_path is not null))
);
create index if not exists payment_proofs_payment_idx on payment_proofs (payment_id);

-- ---------------------------------------------------------------------------
-- Reviews (only after a completed, non-cancelled booking; a DB unique on
-- booking_id makes a duplicate review impossible even under a race)
-- ---------------------------------------------------------------------------
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references bookings(id) on delete restrict,
  tutor_id      uuid not null references tutors(id) on delete cascade,
  author_user_id uuid not null references users(id) on delete cascade,
  rating        integer not null check (rating between 1 and 5),
  comment       text,
  -- optional category scores (clarity, punctuality, ...), admin-configurable
  categories    jsonb not null default '{}'::jsonb,
  status        review_status not null default 'pending',
  moderated_by  uuid references users(id) on delete set null,
  moderated_at  timestamptz,
  moderation_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists reviews_tutor_idx on reviews (tutor_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications and booking messages
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,
  params      jsonb not null default '{}'::jsonb,
  channel     notification_channel not null default 'in_app',
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  delivered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read_at, created_at desc);

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  sender_user_id uuid references users(id) on delete set null,
  sender_role   user_role_kind not null default 'student',
  body          text not null check (length(body) between 1 and 4000),
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists messages_booking_idx on messages (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Platform settings (admin-editable, never hard-coded)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only by construction: no UPDATE/DELETE path in the app,
-- and the table is protected by a trigger that rejects mutation)
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id            bigserial primary key,
  actor_user_id uuid references users(id) on delete set null,
  actor_label   text,
  action        text not null,
  entity        text not null,
  entity_id     text,
  reason        text,
  before        jsonb,
  after         jsonb,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on audit_logs (entity, entity_id, created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs (actor_user_id, created_at desc);

create or replace function audit_logs_immutable() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only';
end $$;

drop trigger if exists audit_logs_no_update on audit_logs;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','user_profiles','educational_stages','subjects','areas','lesson_types',
    'students','tutors','tutor_availability','subscription_plans','subscriptions',
    'bookings','payments','reviews','settings'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t);
  end loop;
end $$;

-- A subscription that expires must not leave the tutor publicly listed: the
-- application checks this predicate on every read, and the check is expressed
-- once here so it cannot drift between queries.
create or replace view public_tutors as
select t.*
from tutors t
join users u on u.id = t.user_id
where t.status = 'approved'
  and t.deleted_at is null
  and u.status = 'active'
  and u.deleted_at is null
  and not exists (
    select 1 from subscriptions s
    where s.tutor_id = t.id
      and s.status = 'active'
      and coalesce(s.grace_until, s.expires_at) < now()
  );
