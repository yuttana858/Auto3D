-- Shared macro library. Every approved account can list and run every macro; only the
-- account that saved a macro, or an Auto3D administrator, can replace or delete it.
-- Server-only: the Pages API authenticates the actor and passes the verified user ID.
-- Browser roles cannot read the table or call the functions.
begin;
create table public.auto3d_macros (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
 definition jsonb not null check (
  jsonb_typeof(definition) = 'object'
  and definition->'version' = '1'::jsonb
  and jsonb_typeof(definition->'steps') = 'array'
  and jsonb_array_length(definition->'steps') between 1 and 100
  and octet_length(definition::text) <= 65536),
 owner_id uuid not null references auth.users(id) on delete cascade,
 owner_label text not null check (char_length(owner_label) between 1 and 100),
 updated_by uuid references auth.users(id) on delete set null,
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index auto3d_macros_name on public.auto3d_macros (lower(name));
create index auto3d_macros_owner on public.auto3d_macros (owner_id);
alter table public.auto3d_macros enable row level security;
revoke all on public.auto3d_macros from public, anon, authenticated;
grant select on public.auto3d_macros to service_role;

-- True when the verified actor's confirmed email is on the administrator list.
create function public.auto3d_macro_is_admin(p_actor uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists (
  select 1 from auth.users u join public.auto3d_admin_emails a on a.email = lower(u.email)
  where u.id = p_actor and u.email_confirmed_at is not null);
$$;

-- Create or replace a macro by name (case-insensitive). p_revision, when given, must match the
-- stored revision so a stale editor cannot overwrite a newer save. Replacing keeps the original
-- owner; only that owner or an administrator may replace it.
create function public.auto3d_macro_save(p_actor uuid, p_name text, p_definition jsonb, p_label text, p_revision uuid default null)
returns table (name text, revision uuid, owner_label text, updated_at timestamptz, created boolean)
language plpgsql security invoker set search_path = '' as $$
declare existing public.auto3d_macros%rowtype;
begin
 if p_actor is null or not exists (select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null and coalesce(u.is_anonymous, false) = false) then
  raise exception using errcode = '42501', message = 'Sign in to save macros.';
 end if;
 if p_name is null or char_length(p_name) not between 1 and 100 or p_name <> btrim(p_name) then
  raise exception using errcode = '22023', message = 'Macro names must be 1-100 characters.';
 end if;
 if p_label is null or char_length(p_label) not between 1 and 100 then
  raise exception using errcode = '22023', message = 'Invalid macro owner label.';
 end if;
 select * into existing from public.auto3d_macros m where lower(m.name) = lower(p_name) for update;
 if found then
  if existing.owner_id <> p_actor and not public.auto3d_macro_is_admin(p_actor) then
   raise exception using errcode = '42501', message = 'Only the person who saved this macro, or an administrator, can replace it.';
  end if;
  if p_revision is not null and existing.revision <> p_revision then
   raise exception using errcode = '40001', message = 'This macro changed in another session. Reload the library before saving.';
  end if;
  update public.auto3d_macros m set name = p_name, definition = p_definition, updated_by = p_actor, revision = gen_random_uuid(), updated_at = now()
   where m.id = existing.id;
  return query select m.name, m.revision, m.owner_label, m.updated_at, false from public.auto3d_macros m where m.id = existing.id;
 else
  if p_revision is not null then
   raise exception using errcode = '40001', message = 'This macro was deleted in another session. Reload the library before saving.';
  end if;
  if (select count(*) from public.auto3d_macros m where m.owner_id = p_actor) >= 200 then
   raise exception using errcode = '54000', message = 'Each account can save up to 200 macros. Delete one first.';
  end if;
  return query insert into public.auto3d_macros as m (name, definition, owner_id, owner_label, updated_by)
   values (p_name, p_definition, p_actor, p_label, p_actor)
   returning m.name, m.revision, m.owner_label, m.updated_at, true;
 end if;
end;
$$;

-- Delete by name (case-insensitive); the owner or an administrator only. Returns the deleted name.
create function public.auto3d_macro_delete(p_actor uuid, p_name text)
returns text language plpgsql security invoker set search_path = '' as $$
declare existing public.auto3d_macros%rowtype;
begin
 select * into existing from public.auto3d_macros m where lower(m.name) = lower(p_name) for update;
 if not found then raise exception using errcode = 'P0002', message = 'No shared macro with that name.'; end if;
 if existing.owner_id <> p_actor and not public.auto3d_macro_is_admin(p_actor) then
  raise exception using errcode = '42501', message = 'Only the person who saved this macro, or an administrator, can delete it.';
 end if;
 delete from public.auto3d_macros m where m.id = existing.id;
 return existing.name;
end;
$$;

revoke all on function public.auto3d_macro_is_admin(uuid), public.auto3d_macro_save(uuid, text, jsonb, text, uuid), public.auto3d_macro_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.auto3d_macro_is_admin(uuid), public.auto3d_macro_save(uuid, text, jsonb, text, uuid), public.auto3d_macro_delete(uuid, text) to service_role;
grant insert, update, delete on public.auto3d_macros to service_role;
commit;
