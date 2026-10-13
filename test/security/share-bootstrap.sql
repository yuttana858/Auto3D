create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auto3d_private;
create table public.auto3d_library(id uuid primary key,status text not null);
alter table public.auto3d_library enable row level security;
create policy published on public.auto3d_library for select to anon,authenticated using(status='published');
grant select on public.auto3d_library to anon,authenticated,service_role;
insert into public.auto3d_library values ('11111111-1111-4111-8111-111111111111','published');
