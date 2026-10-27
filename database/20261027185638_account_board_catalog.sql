alter table public.auto3d_preferences add column if not exists board_database jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='auto3d_board_database_shape' and conrelid='public.auto3d_preferences'::regclass) then
    alter table public.auto3d_preferences add constraint auto3d_board_database_shape check (
      board_database is null or (
        jsonb_typeof(board_database) = 'object'
        and board_database ?& array['version','revision','records']
        and board_database->>'version' = '1'
        and jsonb_typeof(board_database->'revision') = 'string'
        and jsonb_typeof(board_database->'records') = 'array'
        and jsonb_array_length(board_database->'records') between 1 and 32
      )
    );
  end if;
end $$;
comment on column public.auto3d_preferences.board_database is 'Private reusable board catalog with optimistic revision. NULL uses nominal app defaults. Existing design material snapshots are independent. Service API validates full records; existing RLS and grants are unchanged.';
notify pgrst, 'reload schema';
