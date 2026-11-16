-- Isolated Postgres test fixture. Never run against the production database.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, is_anonymous boolean default false, banned_until timestamptz, email text, email_confirmed_at timestamptz);
create table public.auto3d_account_controls (user_id uuid, disabled boolean default false);
grant usage on schema auth,public to service_role;
grant select(id,banned_until,email,email_confirmed_at) on auth.users to service_role;
grant select on public.auto3d_account_controls to service_role;
