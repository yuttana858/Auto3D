-- Use isolated fixture only: postgres -v ON_ERROR_STOP=1.
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004');
update auth.users set email_confirmed_at=now();
update auth.users set email='member@example.com' where id='00000000-0000-4000-8000-000000000002';
do $$ begin
 if has_table_privilege('authenticated','public.auto3d_conversation_messages','select') or has_function_privilege('authenticated','public.auto3d_conversation_send(uuid,uuid,text,text,uuid)','execute') then raise exception 'Browser role can read or send messages'; end if;
end $$;
set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; b uuid := '00000000-0000-4000-8000-000000000002'; outsider uuid := '00000000-0000-4000-8000-000000000003'; fourth uuid := '00000000-0000-4000-8000-000000000004'; conversation uuid; ai uuid; group_id uuid; cursor_time timestamptz; cursor_id uuid;
begin
 conversation := public.auto3d_conversation_create(a,'direct','',array[b]);
 begin perform public.auto3d_conversation_create(a,'direct','',array['00000000-0000-4000-8000-000000000099'::uuid]); raise exception 'Unknown recipient accepted'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.auto3d_conversation_list(b)) <> 1 then raise exception 'Member could not list conversation'; end if;
 if (select count(*) from public.auto3d_conversation_list(outsider)) <> 0 then raise exception 'Outsider listed conversation'; end if;
 if public.auto3d_messenger_find_user(a,'MEMBER@example.com') <> b then raise exception 'Exact verified user lookup failed'; end if;
 if public.auto3d_messenger_find_user(a,'nobody@example.com') is not null then raise exception 'Missing user returned a result'; end if;
 for i in 1..18 loop perform public.auto3d_messenger_find_user(a,'nobody@example.com'); end loop;
 begin perform public.auto3d_messenger_find_user(a,'nobody@example.com'); raise exception 'Lookup rate limit did not apply'; exception when invalid_parameter_value then null; end;
 perform public.auto3d_conversation_send(a,conversation,'hello','user','00000000-0000-4000-8000-000000000005');
 perform public.auto3d_conversation_send(a,conversation,'hello','user','00000000-0000-4000-8000-000000000005');
 if (select count(*) from public.auto3d_conversation_read(b,conversation,null,null,50)) <> 1 then raise exception 'Member could not read'; end if;
 if (select count(*) from public.auto3d_conversation_read(outsider,conversation,null,null,50)) <> 0 then raise exception 'Outsider read a message'; end if;
 begin perform public.auto3d_conversation_send(outsider,conversation,'forged','user','00000000-0000-4000-8000-000000000006'); raise exception 'Outsider sent a message'; exception when invalid_parameter_value then null; end;
 begin perform public.auto3d_conversation_send(a,conversation,'forged','agent','00000000-0000-4000-8000-000000000007'); raise exception 'Agent origin accepted in a group'; exception when invalid_parameter_value then null; end;
 ai := public.auto3d_conversation_create(a,'ai','AI history',array[]::uuid[]);
 perform public.auto3d_conversation_send(a,ai,'Agent reply','agent','00000000-0000-4000-8000-000000000008');
 for i in 1..45 loop perform public.auto3d_conversation_send(a,ai,'Message '||i,'user',md5('fixture-'||i)::uuid); end loop;
 select created_at,id into cursor_time,cursor_id from public.auto3d_conversation_read(a,ai,null,null,20) order by created_at desc,id desc offset 19 limit 1;
 if (select count(*) from public.auto3d_conversation_read(a,ai,cursor_time,cursor_id,20))<>20 then raise exception 'Older history page missing'; end if;
 if exists(select 1 from public.auto3d_conversation_read(a,ai,cursor_time,cursor_id,20) where id=cursor_id) then raise exception 'History cursor duplicated'; end if;
 if (select count(*) from public.auto3d_conversation_read(b,ai,null,null,50)) <> 0 then raise exception 'Another user read AI history'; end if;
 group_id := public.auto3d_conversation_create(a,'group','Team',array[b,outsider]);
 perform public.auto3d_conversation_send(b,group_id,'Group update','user','00000000-0000-4000-8000-000000000009');
 if (select count(*) from public.auto3d_conversation_read(outsider,group_id,null,null,50)) <> 1 then raise exception 'Group member could not read'; end if;
 if (select count(*) from public.auto3d_conversation_read(fourth,group_id,null,null,50)) <> 0 then raise exception 'Non-member read group'; end if;
 perform public.auto3d_conversation_leave(outsider,group_id);
 if (select count(*) from public.auto3d_conversation_read(outsider,group_id,null,null,50)) <> 0 then raise exception 'Former member read group'; end if;
 begin perform public.auto3d_conversation_send(outsider,group_id,'after leaving','user','00000000-0000-4000-8000-000000000010'); raise exception 'Former member sent a message'; exception when invalid_parameter_value then null; end;
 begin perform public.auto3d_conversation_leave(b,ai); raise exception 'AI history left by non-owner'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
