do $$
declare actor text;
begin
    foreach actor in array array['anon','authenticated'] loop
        if has_function_privilege(actor,'public.auto3d_create_share(uuid,uuid,boolean,text,boolean)','execute')
           or has_function_privilege(actor,'public.auto3d_verify_share(uuid,text)','execute')
           or has_any_column_privilege(actor,'public.auto3d_share_links','select,insert,update,references')
           or has_any_column_privilege(actor,'auto3d_private.auto3d_share_codes','select,insert,update,references') then
            raise exception 'Browser role still has share access: %',actor;
        end if;
        execute format('set local role %I',actor);
        begin perform token from public.auto3d_share_links; raise exception 'Unexpected SELECT access'; exception when insufficient_privilege then null; end;
        begin perform public.auto3d_create_share('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',true,null,false); raise exception 'Unexpected create RPC access'; exception when insufficient_privilege then null; end;
        begin perform public.auto3d_verify_share('22222222-2222-4222-8222-222222222222',null); raise exception 'Unexpected verify RPC access'; exception when insufficient_privilege then null; end;
        execute 'reset role';
    end loop;
end $$;
set role service_role;
select public.auto3d_create_share('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',false,repeat('a',64),true);
do $$
begin
    if (select count(*) from public.auto3d_verify_share('33333333-3333-4333-8333-333333333333',repeat('a',64)))<>1 then raise exception 'Correct PIN failed'; end if;
    if (select count(*) from public.auto3d_verify_share('33333333-3333-4333-8333-333333333333',repeat('b',64)))<>0 then raise exception 'Wrong PIN accepted'; end if;
end $$;
reset role;
select 'Browser roles denied; service creation and correct/wrong PIN verification passed' result;
