-- Shared macro library: everyone lists, only the owner or an administrator replaces or deletes.
do $$ begin
 if has_table_privilege('authenticated', 'public.auto3d_macros', 'select') or has_table_privilege('anon', 'public.auto3d_macros', 'select')
  or has_function_privilege('authenticated', 'public.auto3d_macro_save(uuid,text,jsonb,text,uuid)', 'execute')
  or has_function_privilege('anon', 'public.auto3d_macro_delete(uuid,text)', 'execute') then
  raise exception 'Browser roles can reach the macro library';
 end if;
end $$;
set role service_role;
do $$
declare
 owner uuid := '00000000-0000-4000-8000-000000000001'; other uuid := '00000000-0000-4000-8000-000000000002';
 admin uuid := '00000000-0000-4000-8000-000000000003'; unconfirmed uuid := '00000000-0000-4000-8000-000000000004';
 macro jsonb := '{"version":1,"steps":[{"id":"fit","command":"view.fit","arguments":{}}]}'; saved record; rev uuid;
begin
 select * into saved from public.auto3d_macro_save(owner, 'demo1', macro, 'Owner'); rev := saved.revision;
 if not saved.created then raise exception 'First save did not create'; end if;
 if (select count(*) from public.auto3d_macros) <> 1 then raise exception 'Shared list missing the macro'; end if;
 begin perform public.auto3d_macro_save(other, 'DEMO1', macro, 'Other'); raise exception 'Another account replaced a macro'; exception when insufficient_privilege then null; end;
 begin perform public.auto3d_macro_delete(other, 'demo1'); raise exception 'Another account deleted a macro'; exception when insufficient_privilege then null; end;
 begin perform public.auto3d_macro_save(unconfirmed, 'mine', macro, 'X'); raise exception 'Unconfirmed account saved'; exception when insufficient_privilege then null; end;
 begin perform public.auto3d_macro_save(owner, ' padded', macro, 'Owner'); raise exception 'Untrimmed name accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.auto3d_macro_save(owner, 'bad', '{"version":2,"steps":[]}', 'Owner'); raise exception 'Invalid definition accepted'; exception when check_violation then null; end;
 -- The owner replaces with the current revision; a stale revision is refused.
 select * into saved from public.auto3d_macro_save(owner, 'Demo1', macro, 'Owner', rev);
 if saved.created or saved.revision = rev then raise exception 'Replace did not issue a new revision'; end if;
 begin perform public.auto3d_macro_save(owner, 'demo1', macro, 'Owner', rev); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
 -- An administrator (case-insensitive email) replaces without taking ownership, then deletes.
 perform public.auto3d_macro_save(admin, 'demo1', macro, 'Admin');
 if (select owner_id from public.auto3d_macros) <> owner or (select updated_by from public.auto3d_macros) <> admin then raise exception 'Admin replace changed the owner'; end if;
 if not public.auto3d_macro_is_admin(admin) or public.auto3d_macro_is_admin(other) then raise exception 'Administrator check is wrong'; end if;
 if public.auto3d_macro_delete(admin, 'DEMO1') <> 'demo1' then raise exception 'Admin delete returned the wrong name'; end if;
 begin perform public.auto3d_macro_delete(owner, 'demo1'); raise exception 'Missing macro deleted'; exception when no_data_found then null; end;
 -- Owner limit.
 for i in 1..200 loop perform public.auto3d_macro_save(other, 'm' || i, macro, 'Other'); end loop;
 begin perform public.auto3d_macro_save(other, 'one more', macro, 'Other'); raise exception 'Owner limit not applied'; exception when program_limit_exceeded then null; end;
end $$;
reset role;
