create or replace function public.cancel_handover(p_handover_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_user_id uuid;
    v_handover record;
    v_member_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    select h.*
    into v_handover
    from public.handovers h
    where h.id = p_handover_id
    for update;

    if not found then
        raise exception 'Handover not found'
            using errcode = 'P0002';
    end if;

    if v_handover.status <> 'PENDING' then
        raise exception 'Handover is no longer pending'
            using errcode = 'P0001';
    end if;

    select fm.id
    into v_member_id
    from public.family_members fm
    where fm.family_id = v_handover.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    update public.handovers
    set status = 'CANCELLED'
    where id = p_handover_id;

    return p_handover_id;
end;
$function$;

create or replace function public.cancel_responsibility_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_user_id uuid;
    v_plan record;
    v_member_id uuid;
    v_now timestamptz := pg_catalog.now();
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    select rp.*
    into v_plan
    from public.responsibility_plans rp
    where rp.id = p_plan_id
    for update;

    if not found then
        raise exception 'Responsibility plan not found'
            using errcode = 'P0002';
    end if;

    select fm.id
    into v_member_id
    from public.family_members fm
    where fm.family_id = v_plan.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    if v_plan.status not in ('PENDING_ACCEPTANCE', 'SCHEDULED') then
        raise exception 'Only pending or scheduled plans can be cancelled'
            using errcode = 'P0001';
    end if;

    update public.responsibility_plans
    set status = 'CANCELLED',
        updated_at = v_now
    where id = p_plan_id;

    return p_plan_id;
end;
$function$;
