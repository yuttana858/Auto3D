-- Profile-only sessions have zero 3D objects. Model files still require one.
-- Existing ownership, quotas, RLS and service-only grants are unchanged.
set local lock_timeout = '5s';
alter table public.auto3d_personal_library
 drop constraint auto3d_personal_library_object_count_check,
 add constraint auto3d_personal_library_object_count_check
 check (object_count between 0 and 1000 and (kind = 'session' or object_count > 0));
