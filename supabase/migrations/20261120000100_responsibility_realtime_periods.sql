-- Responsibility snapshots include the active period, so publish period changes too.
do $$
begin
    if exists (
        select 1
        from pg_publication
        where pubname = 'supabase_realtime'
    ) and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'responsibility_periods'
    ) then
        alter publication supabase_realtime add table public.responsibility_periods;
    end if;
end;
$$;
