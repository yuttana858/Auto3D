do $$ begin
 if has_table_privilege('anon','public.auto3d_audience_shares','SELECT') or has_table_privilege('authenticated','public.auto3d_audience_shares','SELECT') then raise exception 'Share metadata exposed'; end if;
 if has_table_privilege('authenticated','public.auto3d_audience_attempts','UPDATE') then raise exception 'Attempts exposed'; end if;
 if has_function_privilege('anon','public.auto3d_verify_audience_share(uuid,text,text)','EXECUTE') or has_function_privilege('authenticated','public.auto3d_reserve_audience_share(uuid,uuid,text,text,text,bigint,text,boolean,integer)','EXECUTE') then raise exception 'RPC exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='public.auto3d_audience_shares'::regclass) then raise exception 'RLS disabled'; end if;
 if exists(select 1 from pg_proc where oid='public.auto3d_verify_audience_share(uuid,text,text)'::regprocedure and prosecdef) then raise exception 'Invoker expected'; end if;
end $$;
set role service_role;
select public.auto3d_reserve_audience_share('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','account','saved-id','Fixture',1024,repeat('a',64),false,30);
update public.auto3d_audience_shares set status='ready';
do $$ declare g record; begin
 for n in 1..4 loop if exists(select * from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('b',64),repeat('c',64))) then raise exception 'Wrong code accepted'; end if; end loop;
 select * into g from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('b',64),repeat('c',64));
 if g.retry_after<>1800 or g.archive_key is not null then raise exception 'Actor limit failed'; end if;
 select * into g from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('c',64));
 if g.retry_after<=0 or g.archive_key is not null then raise exception 'Locked actor bypass'; end if;
 select * into g from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('d',64));
 if g.archive_key is null or g.retry_after<>0 or g.allow_download then raise exception 'Correct code grant failed'; end if;
end $$;
update public.auto3d_audience_shares set failed_count=29;
do $$ declare g record; begin
 select * into g from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('b',64),repeat('e',64));
 if g.retry_after<>1800 then raise exception 'Global limit failed'; end if;
 select * into g from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('f',64));
 if g.retry_after<=0 or g.archive_key is not null then raise exception 'Distributed limit bypass'; end if;
end $$;
update public.auto3d_audience_shares set failed_count=0,window_started=now()-interval '31 minutes',locked_until=now()-interval '1 minute';
update public.auto3d_audience_attempts set locked_until=now()-interval '1 minute',window_started=now()-interval '31 minutes';
do $$ begin
 if not exists(select * from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('c',64)) where archive_key is not null) then raise exception 'Expired lock did not recover'; end if;
end $$;
update public.auto3d_audience_shares set status='revoked';
do $$ begin
 if exists(select * from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('d',64))) then raise exception 'Revocation bypass'; end if;
end $$;
update public.auto3d_audience_shares set status='ready',expires_at=now()-interval '1 second';
do $$ begin
 if exists(select * from public.auto3d_verify_audience_share('33333333-3333-4333-8333-333333333333',repeat('a',64),repeat('d',64))) then raise exception 'Expiry bypass'; end if;
end $$;
reset role;
-- Quotas count pending and expired files, without leaking across owners.
set role service_role;
insert into public.auto3d_audience_shares(token,owner_id,source,source_item_id,name,archive_key,file_size,code_hash,expires_at)
select md5('quota-'||n)::uuid,'22222222-2222-4222-8222-222222222222','device','fixture','Quota fixture','quota/'||n,33554432,repeat('a',64),now()+interval '1 day' from generate_series(1,32) n;
do $$ declare blocked boolean:=false; begin
 begin perform public.auto3d_reserve_audience_share('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','device','fixture','Over quota',4,repeat('a',64),false,30); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Owner quota bypass'; end if;
 perform public.auto3d_reserve_audience_share('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','device','fixture','Other owner',4,repeat('a',64),false,30);
end $$;
reset role;
