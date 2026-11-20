-- Isolated Postgres test fixture. Never run against the production database.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, is_anonymous boolean default false, email text, email_confirmed_at timestamptz);
create table public.auto3d_admin_emails (email text primary key check (email = lower(email)));
grant usage on schema auth, public to service_role;
grant select (id, is_anonymous, email, email_confirmed_at) on auth.users to service_role;
grant select on public.auto3d_admin_emails to service_role;
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000001', 'owner@example.com', now()),
 ('00000000-0000-4000-8000-000000000002', 'other@example.com', now()),
 ('00000000-0000-4000-8000-000000000003', 'Admin@Example.com', now()),
 ('00000000-0000-4000-8000-000000000004', 'unconfirmed@example.com', null);
insert into public.auto3d_admin_emails values ('admin@example.com');
