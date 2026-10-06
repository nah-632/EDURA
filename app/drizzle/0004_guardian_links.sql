-- EDURA 0004 — guardian links (slice A+K)
-- An explicit, verified relationship between a minor student and their
-- guardian, with documented consent (A) and a server-side gate before any
-- booking for a minor (K).
--
-- Rules honoured here (owner-approved plan, 2026-10-06):
--  * ADDITIVE ONLY: new table, new function, new trigger, backfill. No column
--    on an existing table is changed, nothing is dropped.
--  * Enforcement flag lives in `settings` under key `platform`
--    (guardianEnforcementStrict, default false) — ONE source of truth read by
--    both the application and the SQL trigger. Grace period: strict=false.
--  * `revoked` links do NOT block a new link later: the partial unique index
--    only covers pending/verified rows.
--  * CASCADE on both foreign keys (guardian and student rows own the link);
--    audit_logs rows are never touched (append-only by trigger).
--  * The trigger reads settings with ONE query per booking insert, no cache.

do $$ begin
  create type guardian_relationship as enum ('father', 'mother', 'legal_guardian', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type guardian_verification_status as enum ('pending', 'verified', 'revoked');
exception when duplicate_object then null; end $$;

create table if not exists guardian_links (
  id                  uuid primary key default gen_random_uuid(),
  guardian_user_id    uuid not null references users(id) on delete cascade,
  student_id          uuid not null references students(id) on delete cascade,
  relationship_type   guardian_relationship not null default 'other',
  verification_status guardian_verification_status not null default 'pending',
  -- How the link was proven. self_declared = the account owner declared the
  -- relationship during the grace period; admin_manual = an operator with
  -- guardian.verify reviewed and confirmed it. Upgrades self_declared ->
  -- admin_manual are recorded by updating the row (audited in the app layer).
  verification_method text not null default 'self_declared'
                        check (verification_method in ('self_declared', 'admin_manual')),
  verified_at         timestamptz,
  verified_by         uuid references users(id) on delete set null,
  revoked_at          timestamptz,
  revoked_by          uuid references users(id) on delete set null,
  revoke_reason       text,
  -- Documented consent (K): captured at link creation from the guardian's own
  -- session. A booking for a minor without a verified, consented link is
  -- refused by the booking gate below once strict enforcement is on.
  consent_granted_at  timestamptz not null default now(),
  consent_ip          text,
  consent_user_agent  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists guardian_links_student_idx on guardian_links (student_id);
create index if not exists guardian_links_guardian_idx on guardian_links (guardian_user_id);

-- One ACTIVE link per (student, guardian). A revoked row frees the pair to
-- create a fresh link; two guardians may each hold a link for the same child
-- (father + mother), but each pair exists once. The application additionally
-- treats the first VERIFIED link as authoritative.
create unique index if not exists guardian_links_one_active_per_pair
  on guardian_links (student_id, guardian_user_id)
  where verification_status in ('pending', 'verified');

-- updated_at maintenance reuses the existing trigger function from 0000.
drop trigger if exists guardian_links_touch on guardian_links;
create trigger guardian_links_touch before update on guardian_links
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: every existing minor is linked to the account that owns it, as a
-- PENDING self_declared link. Nothing breaks: strict enforcement is off until
-- an operator flips the flag after reviewing links.
-- ---------------------------------------------------------------------------
insert into guardian_links (guardian_user_id, student_id, relationship_type,
                            verification_status, verification_method)
select s.owner_user_id, s.id, 'other', 'pending', 'self_declared'
  from students s
 where s.deleted_at is null and s.is_minor
   and not exists (
     select 1 from guardian_links g
      where g.student_id = s.id
        and g.guardian_user_id = s.owner_user_id
        and g.verification_status in ('pending', 'verified')
   );

-- ---------------------------------------------------------------------------
-- RBAC mirror: the application's ROLE_PERMISSIONS matrix gains guardian.verify
-- (super_admin/admin inherit ALL; moderator listed explicitly). Seed the same
-- permission into the database tables so joins stay truthful.
-- ---------------------------------------------------------------------------
insert into permissions (code, description)
values ('guardian.verify', 'Verify or revoke a guardian link for a minor student')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
 where r.code in ('super_admin', 'admin', 'moderator') and p.code = 'guardian.verify'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- K: booking gate INSIDE the database.
-- BEFORE INSERT on bookings: if strict enforcement is on (settings, one query)
-- and the student is a minor, the booking's customer must hold a VERIFIED
-- guardian link for that student. Fails closed: if the settings row cannot be
-- read the gate treats strict as ON (defence in depth must not depend on a
-- readable configuration row); the flag only ever relaxes when explicitly
-- set to false.
-- ---------------------------------------------------------------------------
create or replace function bookings_guardian_gate() returns trigger
language plpgsql
as $$
declare
  v_strict boolean;
  v_minor  boolean;
begin
  select (s.value->>'guardianEnforcementStrict')::boolean
    into v_strict
    from settings s
   where s.key = 'platform';
  -- Row missing or flag absent => treat as strict (fail closed).
  if v_strict is null then v_strict := true; end if;

  if v_strict is not true then return new; end if;

  select s.is_minor into v_minor from students s where s.id = new.student_id;
  if v_minor is not true then return new; end if;

  if exists (
    select 1 from guardian_links g
     where g.student_id = new.student_id
       and g.guardian_user_id = new.customer_user_id
       and g.verification_status = 'verified'
  ) then
    return new;
  end if;

  raise exception 'guardian_required' using errcode = 'GD000';
end $$;

drop trigger if exists bookings_guardian_gate_trg on bookings;
create trigger bookings_guardian_gate_trg
  before insert on bookings
  for each row execute function bookings_guardian_gate();
