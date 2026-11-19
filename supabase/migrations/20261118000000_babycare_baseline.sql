-- Canonical BabyCare Hub schema for a fresh Supabase project.
-- This is a bootstrap snapshot, not an incremental migration for an existing DB.
-- Apply using the Supabase SQL Editor or a clean local Supabase database.

create schema if not exists extensions;
grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema public;
create extension if not exists pg_cron with schema pg_catalog;

create type public.family_member_role as enum (
    'PRIMARY_PARENT', 'CO_PARENT', 'CAREGIVER'
);
create type public.family_member_status as enum (
    'ACTIVE', 'INVITED', 'REMOVED'
);
create type public.handover_status as enum (
    'PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'
);
create type public.handover_type as enum (
    'IMMEDIATE', 'PLANNED', 'RETURN'
);
create type public.responsibility_plan_status as enum (
    'PENDING_ACCEPTANCE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED',
    'CANCELLED', 'DECLINED', 'NOT_STARTED'
);

create table public.families (
    id uuid not null default gen_random_uuid(),
    name text not null,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.family_members (
    id uuid not null default gen_random_uuid(),
    family_id uuid not null,
    user_id uuid not null,
    role public.family_member_role not null,
    status public.family_member_status not null default 'ACTIVE',
    joined_at timestamptz,
    created_at timestamptz not null default now()
);

create table public.children (
    id uuid not null default gen_random_uuid(),
    family_id uuid not null,
    name text not null,
    birth_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.responsibilities (
    id uuid not null default gen_random_uuid(),
    child_id uuid not null,
    current_responsible_id uuid not null,
    started_at timestamptz not null default now(),
    version bigint not null default 1,
    updated_at timestamptz not null default now(),
    family_id uuid not null
);

create table public.responsibility_periods (
    id uuid not null default gen_random_uuid(),
    child_id uuid not null,
    responsible_id uuid not null,
    actual_start_at timestamptz not null,
    actual_end_at timestamptz,
    started_by uuid not null,
    ended_by uuid,
    created_at timestamptz not null default now(),
    family_id uuid not null
);

create table public.responsibility_plans (
    id uuid not null default gen_random_uuid(),
    child_id uuid not null,
    responsible_id uuid not null,
    created_by uuid not null,
    planned_start_at timestamptz not null,
    planned_end_at timestamptz not null,
    status public.responsibility_plan_status not null default 'PENDING_ACCEPTANCE',
    accepted_by uuid,
    accepted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    family_id uuid not null,
    previous_responsible_id uuid
);

create table public.handovers (
    id uuid not null default gen_random_uuid(),
    child_id uuid not null,
    from_parent_id uuid,
    to_parent_id uuid not null,
    initiated_by uuid not null,
    type public.handover_type not null,
    status public.handover_status not null default 'PENDING',
    responsibility_plan_id uuid,
    requested_at timestamptz not null default now(),
    accepted_at timestamptz,
    family_id uuid not null
);

create table public.idempotency_requests (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null,
    operation text not null,
    idempotency_key uuid not null,
    request_hash text not null,
    response jsonb,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create table public.family_invitations (
    token uuid not null,
    family_id uuid not null,
    created_by_member_id uuid not null,
    expires_at timestamptz not null,
    accepted_by uuid,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    member_role text not null
);

create table public.user_profiles (
    user_id uuid not null,
    display_name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Primary/unique keys and family-scoped keys used by the composite FKs.
alter table public.families add constraint families_pkey primary key (id);
alter table public.family_members add constraint family_members_pkey primary key (id);
alter table public.family_members add constraint family_members_family_id_user_id_key unique (family_id, user_id);
alter table public.family_members add constraint family_members_id_family_id_key unique (id, family_id);
alter table public.children add constraint children_pkey primary key (id);
alter table public.children add constraint children_id_family_id_key unique (id, family_id);
alter table public.responsibilities add constraint responsibilities_pkey primary key (id);
alter table public.responsibilities add constraint responsibilities_child_id_key unique (child_id);
alter table public.responsibility_periods add constraint responsibility_periods_pkey primary key (id);
alter table public.responsibility_plans add constraint responsibility_plans_pkey primary key (id);
alter table public.handovers add constraint handovers_pkey primary key (id);
alter table public.idempotency_requests add constraint idempotency_requests_pkey primary key (id);
alter table public.family_invitations add constraint family_invitations_pkey primary key (token);
alter table public.user_profiles add constraint user_profiles_pkey primary key (user_id);

alter table public.families add constraint families_created_by_fkey
    foreign key (created_by) references auth.users(id);
alter table public.family_members add constraint family_members_family_id_fkey
    foreign key (family_id) references public.families(id);
alter table public.family_members add constraint family_members_user_id_fkey
    foreign key (user_id) references auth.users(id);
alter table public.children add constraint children_family_id_fkey
    foreign key (family_id) references public.families(id);

alter table public.responsibilities add constraint responsibilities_version_check check (version > 0);
alter table public.responsibilities add constraint fk_responsibilities_child_family
    foreign key (child_id, family_id) references public.children(id, family_id);
alter table public.responsibilities add constraint fk_responsibilities_member_family
    foreign key (current_responsible_id, family_id) references public.family_members(id, family_id);
alter table public.responsibilities add constraint responsibilities_child_id_fkey
    foreign key (child_id) references public.children(id);
alter table public.responsibilities add constraint responsibilities_current_responsible_id_fkey
    foreign key (current_responsible_id) references public.family_members(id);

alter table public.responsibility_periods add constraint responsibility_periods_check
    check (actual_end_at is null or actual_end_at >= actual_start_at);
alter table public.responsibility_periods add constraint fk_periods_child_family
    foreign key (child_id, family_id) references public.children(id, family_id);
alter table public.responsibility_periods add constraint fk_periods_responsible_family
    foreign key (responsible_id, family_id) references public.family_members(id, family_id);
alter table public.responsibility_periods add constraint fk_periods_started_by_family
    foreign key (started_by, family_id) references public.family_members(id, family_id);
alter table public.responsibility_periods add constraint fk_periods_ended_by_family
    foreign key (ended_by, family_id) references public.family_members(id, family_id);
alter table public.responsibility_periods add constraint responsibility_periods_child_id_fkey
    foreign key (child_id) references public.children(id);
alter table public.responsibility_periods add constraint responsibility_periods_responsible_id_fkey
    foreign key (responsible_id) references public.family_members(id);
alter table public.responsibility_periods add constraint responsibility_periods_started_by_fkey
    foreign key (started_by) references public.family_members(id);
alter table public.responsibility_periods add constraint responsibility_periods_ended_by_fkey
    foreign key (ended_by) references public.family_members(id);

alter table public.responsibility_plans add constraint responsibility_plans_check
    check (planned_end_at > planned_start_at);
alter table public.responsibility_plans add constraint responsibility_plans_check1
    check ((accepted_by is null and accepted_at is null) or (accepted_by is not null and accepted_at is not null));
alter table public.responsibility_plans add constraint fk_plans_child_family
    foreign key (child_id, family_id) references public.children(id, family_id);
alter table public.responsibility_plans add constraint fk_plans_responsible_family
    foreign key (responsible_id, family_id) references public.family_members(id, family_id);
alter table public.responsibility_plans add constraint fk_plans_created_by_family
    foreign key (created_by, family_id) references public.family_members(id, family_id);
alter table public.responsibility_plans add constraint fk_plans_accepted_by_family
    foreign key (accepted_by, family_id) references public.family_members(id, family_id);
alter table public.responsibility_plans add constraint responsibility_plans_child_id_fkey
    foreign key (child_id) references public.children(id);
alter table public.responsibility_plans add constraint responsibility_plans_responsible_id_fkey
    foreign key (responsible_id) references public.family_members(id);
alter table public.responsibility_plans add constraint responsibility_plans_created_by_fkey
    foreign key (created_by) references public.family_members(id);
alter table public.responsibility_plans add constraint responsibility_plans_accepted_by_fkey
    foreign key (accepted_by) references public.family_members(id);
alter table public.responsibility_plans add constraint responsibility_plans_previous_responsible_id_fkey
    foreign key (previous_responsible_id) references public.family_members(id);
alter table public.responsibility_plans add constraint ex_responsibility_plans_no_overlap
    exclude using gist (
        child_id with =,
        tstzrange(planned_start_at, planned_end_at, '[)') with &&
    ) where (status in ('PENDING_ACCEPTANCE', 'SCHEDULED', 'IN_PROGRESS'));

alter table public.handovers add constraint handovers_check
    check (from_parent_id is null or from_parent_id <> to_parent_id);
alter table public.handovers add constraint fk_handovers_child_family
    foreign key (child_id, family_id) references public.children(id, family_id);
alter table public.handovers add constraint fk_handovers_from_family
    foreign key (from_parent_id, family_id) references public.family_members(id, family_id);
alter table public.handovers add constraint fk_handovers_to_family
    foreign key (to_parent_id, family_id) references public.family_members(id, family_id);
alter table public.handovers add constraint fk_handovers_initiated_by_family
    foreign key (initiated_by, family_id) references public.family_members(id, family_id);
alter table public.handovers add constraint handovers_child_id_fkey
    foreign key (child_id) references public.children(id);
alter table public.handovers add constraint handovers_from_parent_id_fkey
    foreign key (from_parent_id) references public.family_members(id);
alter table public.handovers add constraint handovers_to_parent_id_fkey
    foreign key (to_parent_id) references public.family_members(id);
alter table public.handovers add constraint handovers_initiated_by_fkey
    foreign key (initiated_by) references public.family_members(id);
alter table public.handovers add constraint handovers_responsibility_plan_id_fkey
    foreign key (responsibility_plan_id) references public.responsibility_plans(id);

alter table public.idempotency_requests add constraint idempotency_requests_user_id_fkey
    foreign key (user_id) references auth.users(id);
alter table public.idempotency_requests add constraint chk_idempotency_completion
    check ((response is null and completed_at is null) or (response is not null and completed_at is not null));
alter table public.idempotency_requests add constraint uq_idempotency_request
    unique (user_id, operation, idempotency_key);

alter table public.family_invitations add constraint family_invitations_family_id_fkey
    foreign key (family_id) references public.families(id) on delete cascade;
alter table public.family_invitations add constraint family_invitations_created_by_member_id_fkey
    foreign key (created_by_member_id) references public.family_members(id);
alter table public.family_invitations add constraint family_invitations_accepted_by_fkey
    foreign key (accepted_by) references auth.users(id);
alter table public.family_invitations add constraint family_invitations_acceptance_check
    check ((accepted_by is null and accepted_at is null) or (accepted_by is not null and accepted_at is not null));
alter table public.family_invitations add constraint family_invitations_member_role_check
    check (member_role in ('CO_PARENT', 'CAREGIVER'));

alter table public.user_profiles add constraint user_profiles_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_profiles add constraint user_profiles_display_name_check
    check (length(btrim(display_name)) > 0);

create index idx_children_family on public.children using btree (family_id);
create index idx_family_members_family on public.family_members using btree (family_id);
create index idx_family_members_user on public.family_members using btree (user_id);
create index family_invitations_family_created_idx on public.family_invitations using btree (family_id, created_at desc);
create index idx_handovers_child on public.handovers using btree (child_id, requested_at desc);
create index idx_handovers_family on public.handovers using btree (family_id);
create index idx_handovers_pending on public.handovers using btree (to_parent_id, requested_at)
    where status = 'PENDING';
create unique index uq_one_pending_handover_per_child on public.handovers using btree (child_id)
    where status = 'PENDING';
create index idx_idempotency_requests_created on public.idempotency_requests using btree (created_at);
create index idx_responsibilities_family on public.responsibilities using btree (family_id);
create index idx_periods_family on public.responsibility_periods using btree (family_id);
create index idx_responsibility_periods_history on public.responsibility_periods using btree (child_id, actual_start_at desc);
create unique index one_active_period_per_child on public.responsibility_periods using btree (child_id)
    where actual_end_at is null;
create index idx_plans_family on public.responsibility_plans using btree (family_id);
create index idx_responsibility_plans_child on public.responsibility_plans using btree (child_id, planned_start_at);
create index idx_responsibility_plans_status on public.responsibility_plans using btree (child_id, status);

-- Function bodies are copied from the live database export, excluding the
-- obsolete two-argument create_family_invitation overload and stale RLS helper.
CREATE OR REPLACE FUNCTION public._begin_idempotent_request(p_operation text, p_idempotency_key uuid, p_payload jsonb)
 RETURNS TABLE(is_replay boolean, cached_response jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
    v_user_id uuid;
    v_request_hash text;
    v_existing_hash text;
    v_response jsonb;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_operation is null
       or pg_catalog.btrim(p_operation) = ''
       or p_idempotency_key is null
       or p_payload is null then
        raise exception 'Invalid idempotency parameters'
            using errcode = '22023';
    end if;

    v_request_hash := pg_catalog.encode(
        extensions.digest(
            pg_catalog.convert_to(p_payload::text, 'UTF8'),
            'sha256'
        ),
        'hex'
    );

    insert into public.idempotency_requests (
        user_id,
        operation,
        idempotency_key,
        request_hash
    )
    values (
        v_user_id,
        p_operation,
        p_idempotency_key,
        v_request_hash
    )
    on conflict (user_id, operation, idempotency_key)
    do nothing;

    -- Lock existing or newly created record.
    select
        ir.request_hash,
        ir.response
    into
        v_existing_hash,
        v_response
    from public.idempotency_requests ir
    where ir.user_id = v_user_id
      and ir.operation = p_operation
      and ir.idempotency_key = p_idempotency_key
    for update;

    if v_existing_hash <> v_request_hash then
        raise exception 'Idempotency key reused with different payload'
            using errcode = '22023';
    end if;

    if v_response is not null then
        return query select true, v_response;
    else
        return query select false, null::jsonb;
    end if;
end;$function$;

CREATE OR REPLACE FUNCTION public._complete_idempotent_request(p_operation text, p_idempotency_key uuid, p_response jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_updated_count integer;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_response is null then
        raise exception 'Response cannot be null'
            using errcode = '22023';
    end if;

    update public.idempotency_requests
    set response = p_response,
        completed_at = pg_catalog.now()
    where user_id = v_user_id
      and operation = p_operation
      and idempotency_key = p_idempotency_key
      and response is null;

    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
        raise exception 'Idempotency request not found or already completed'
            using errcode = 'P0001';
    end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public._transfer_responsibility(p_child_id uuid, p_family_id uuid, p_from_member_id uuid, p_to_member_id uuid, p_initiated_by uuid, p_handover_type handover_type)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_now timestamptz := pg_catalog.now();
    v_handover_id uuid;
    v_updated_count integer;
begin
    if p_from_member_id = p_to_member_id then
        raise exception 'Cannot transfer responsibility to the current responsible member'
            using errcode = '22023';
    end if;

    -- Close the current actual responsibility period
    update public.responsibility_periods
    set actual_end_at = v_now,
        ended_by = p_initiated_by
    where child_id = p_child_id
      and family_id = p_family_id
      and responsible_id = p_from_member_id
      and actual_end_at is null;

    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
        raise exception 'Expected exactly one active responsibility period, found %',
            v_updated_count
            using errcode = 'P0001';
    end if;

    -- Start a new actual responsibility period
    insert into public.responsibility_periods (
        child_id,
        family_id,
        responsible_id,
        actual_start_at,
        started_by,
        created_at
    )
    values (
        p_child_id,
        p_family_id,
        p_to_member_id,
        v_now,
        p_initiated_by,
        v_now
    );

    -- Update current responsibility
    update public.responsibilities
    set current_responsible_id = p_to_member_id,
        started_at = v_now,
        version = version + 1,
        updated_at = v_now
    where child_id = p_child_id
      and family_id = p_family_id
      and current_responsible_id = p_from_member_id;

    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
        raise exception 'Responsibility state changed unexpectedly'
            using errcode = 'P0001';
    end if;

    -- Record the completed handover
    insert into public.handovers (
        child_id,
        family_id,
        from_parent_id,
        to_parent_id,
        initiated_by,
        type,
        status,
        requested_at,
        accepted_at
    )
    values (
        p_child_id,
        p_family_id,
        p_from_member_id,
        p_to_member_id,
        p_initiated_by,
        p_handover_type,
        'ACCEPTED',
        v_now,
        v_now
    )
    returning id into v_handover_id;

    return v_handover_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_family_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.family_invitations%rowtype;
    v_member_id uuid;
    v_member_role public.family_members.role%type;
    v_member_status public.family_members.status%type;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;
    if p_token is null then
        raise exception 'Invitation token is required' using errcode = '22023';
    end if;

    select * into v_invitation
    from public.family_invitations fi
    where fi.token = p_token
    for update;

    if not found then
        raise exception 'Invitation not found' using errcode = '22023';
    end if;
    if v_invitation.accepted_by is not null then
        if v_invitation.accepted_by = v_user_id then
            return v_invitation.family_id;
        end if;
        raise exception 'Invitation has already been used' using errcode = '22023';
    end if;
    if v_invitation.revoked_at is not null then
        raise exception 'Invitation has been revoked' using errcode = '22023';
    end if;
    if v_invitation.expires_at <= now() then
        raise exception 'Invitation has expired' using errcode = '22023';
    end if;

    -- Serialize accepts from different invite codes for the same user/family.
    perform pg_advisory_xact_lock(
        hashtextextended(v_invitation.family_id::text || ':' || v_user_id::text, 0)
    );

    select fm.id, fm.status into v_member_id, v_member_status
    from public.family_members fm
    where fm.family_id = v_invitation.family_id
      and fm.user_id = v_user_id
    order by fm.created_at desc
    limit 1
    for update;

    if v_member_id is null then
        v_member_role := v_invitation.member_role;
        insert into public.family_members (
            family_id, user_id, role, status, joined_at
        ) values (
            v_invitation.family_id, v_user_id, v_member_role, 'ACTIVE', now()
        );
    elsif v_member_status <> 'ACTIVE' then
        v_member_role := v_invitation.member_role;
        update public.family_members
        set status = 'ACTIVE', role = v_member_role, joined_at = now()
        where id = v_member_id;
    end if;

    update public.family_invitations
    set accepted_by = v_user_id, accepted_at = now()
    where token = p_token;

    return v_invitation.family_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_handover(p_handover_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_child_id uuid;
    v_family_id uuid;
    v_current_member_id uuid;
    v_handover record;
    v_target_member_id uuid;
    v_result uuid;
    v_idem record;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_idempotency_key is null then
        raise exception 'Idempotency key is required'
            using errcode = '22023';
    end if;

    select h.child_id
    into v_child_id
    from public.handovers h
    where h.id = p_handover_id;

    if not found then
        raise exception 'Handover not found'
            using errcode = 'P0002';
    end if;

    select
        r.family_id,
        r.current_responsible_id
    into
        v_family_id,
        v_current_member_id
    from public.responsibilities r
    where r.child_id = v_child_id
    for update;

    if not found then
        raise exception 'Responsibility record not found'
            using errcode = 'P0002';
    end if;

    select *
    into v_idem
    from public._begin_idempotent_request(
        'accept_handover',
        p_idempotency_key,
        jsonb_build_object(
            'handover_id', p_handover_id
        )
    );

    if v_idem.is_replay then
        return (v_idem.cached_response->>'handover_id')::uuid;
    end if;

    select h.*
    into v_handover
    from public.handovers h
    where h.id = p_handover_id
      and h.child_id = v_child_id
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
    into v_target_member_id
    from public.family_members fm
    where fm.id = v_handover.to_parent_id
      and fm.family_id = v_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_target_member_id is null then
        raise exception 'Only intended recipient can accept this handover'
            using errcode = '42501';
    end if;

    if v_current_member_id <> v_handover.from_parent_id then
        update public.handovers
        set status = 'CANCELLED'
        where id = p_handover_id;

        v_result := null;
    else
        update public.responsibility_periods
        set actual_end_at = pg_catalog.now(),
            ended_by = v_target_member_id
        where child_id = v_child_id
          and family_id = v_family_id
          and responsible_id = v_current_member_id
          and actual_end_at is null;

        if not found then
            raise exception 'Active responsibility period not found'
                using errcode = 'P0001';
        end if;

        insert into public.responsibility_periods (
            child_id,
            family_id,
            responsible_id,
            actual_start_at,
            started_by,
            created_at
        )
        values (
            v_child_id,
            v_family_id,
            v_target_member_id,
            pg_catalog.now(),
            v_target_member_id,
            pg_catalog.now()
        );

        update public.responsibilities
        set current_responsible_id = v_target_member_id,
            started_at = pg_catalog.now(),
            version = version + 1,
            updated_at = pg_catalog.now()
        where child_id = v_child_id
          and current_responsible_id = v_current_member_id;

        if not found then
            raise exception 'Responsibility state changed unexpectedly'
                using errcode = 'P0001';
        end if;

        update public.handovers
        set status = 'ACCEPTED',
            accepted_at = pg_catalog.now()
        where id = p_handover_id;

        v_result := p_handover_id;
    end if;

    perform public._complete_idempotent_request(
        'accept_handover',
        p_idempotency_key,
        jsonb_build_object(
            'handover_id', v_result
        )
    );

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_responsibility(p_child_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_family_id uuid;
    v_current_member_id uuid;
    v_new_member_id uuid;
    v_handover_id uuid;
    v_idem record;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_idempotency_key is null then
        raise exception 'Idempotency key is required'
            using errcode = '22023';
    end if;

    select
        r.family_id,
        r.current_responsible_id
    into
        v_family_id,
        v_current_member_id
    from public.responsibilities r
    where r.child_id = p_child_id
    for update;

    if not found then
        raise exception 'Responsibility record not found'
            using errcode = 'P0002';
    end if;

    select fm.id
    into v_new_member_id
    from public.family_members fm
    where fm.family_id = v_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_new_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    select *
    into v_idem
    from public._begin_idempotent_request(
        'accept_responsibility',
        p_idempotency_key,
        jsonb_build_object(
            'child_id', p_child_id
        )
    );

    if v_idem.is_replay then
        return (v_idem.cached_response->>'handover_id')::uuid;
    end if;

    if v_current_member_id = v_new_member_id then
        v_handover_id := null;
    else
        update public.handovers
        set status = 'CANCELLED'
        where child_id = p_child_id
          and status = 'PENDING';

        v_handover_id := public._transfer_responsibility(
            p_child_id,
            v_family_id,
            v_current_member_id,
            v_new_member_id,
            v_new_member_id,
            'IMMEDIATE'
        );
    end if;

    perform public._complete_idempotent_request(
        'accept_responsibility',
        p_idempotency_key,
        jsonb_build_object(
            'handover_id', v_handover_id
        )
    );

    return v_handover_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_responsibility_plan(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    -- Lock plan
    select rp.*
    into v_plan
    from public.responsibility_plans rp
    where rp.id = p_plan_id
    for update;

    if not found then
        raise exception 'Responsibility plan not found'
            using errcode = 'P0002';
    end if;

    if v_plan.status <> 'PENDING_ACCEPTANCE' then
        raise exception 'Plan is not awaiting acceptance'
            using errcode = 'P0001';
    end if;

    -- Verify intended responsible member
    select fm.id
    into v_member_id
    from public.family_members fm
    where fm.id = v_plan.responsible_id
      and fm.family_id = v_plan.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Only the intended active responsible member can accept this plan'
            using errcode = '42501';
    end if;

    update public.responsibility_plans
    set status = 'SCHEDULED',
        accepted_by = v_member_id,
        accepted_at = v_now,
        updated_at = v_now
    where id = p_plan_id;

    return p_plan_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_read_user_profile(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    select p_user_id = (select auth.uid())
        or exists (
            select 1
            from public.family_members target_member
            join public.family_members viewer_member
              on viewer_member.family_id = target_member.family_id
            where target_member.user_id = p_user_id
              and target_member.status = 'ACTIVE'
              and viewer_member.user_id = (select auth.uid())
              and viewer_member.status = 'ACTIVE'
        );
$function$;

CREATE OR REPLACE FUNCTION public.cancel_handover(p_handover_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where fm.id = v_handover.initiated_by
      and fm.family_id = v_handover.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Only the initiator can cancel this handover'
            using errcode = '42501';
    end if;

    update public.handovers
    set status = 'CANCELLED'
    where id = p_handover_id;

    return p_handover_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_responsibility_plan(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and fm.status = 'ACTIVE'
      and fm.id in (
          v_plan.created_by,
          v_plan.responsible_id
      );

    if v_member_id is null then
        raise exception 'Only the plan creator or planned responsible member can cancel it'
            using errcode = '42501';
    end if;

    if v_plan.status not in (
        'PENDING_ACCEPTANCE',
        'SCHEDULED'
    ) then
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

CREATE OR REPLACE FUNCTION public.create_child(p_family_id uuid, p_name text, p_birth_date date, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_member_id uuid;
    v_child_id uuid;
    v_now timestamptz := pg_catalog.now();
    v_idem record;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_idempotency_key is null then
        raise exception 'Idempotency key is required'
            using errcode = '22023';
    end if;

    select *
    into v_idem
    from public._begin_idempotent_request(
        'create_child',
        p_idempotency_key,
        jsonb_build_object(
            'family_id', p_family_id,
            'name', pg_catalog.btrim(p_name),
            'birth_date', p_birth_date
        )
    );

    if v_idem.is_replay then
        return (v_idem.cached_response->>'child_id')::uuid;
    end if;

    if p_name is null or pg_catalog.btrim(p_name) = '' then
        raise exception 'Child name cannot be empty'
            using errcode = '22023';
    end if;

    select fm.id
    into v_member_id
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    insert into public.children (
        family_id,
        name,
        birth_date,
        created_at,
        updated_at
    )
    values (
        p_family_id,
        pg_catalog.btrim(p_name),
        p_birth_date,
        v_now,
        v_now
    )
    returning id into v_child_id;

    insert into public.responsibilities (
        child_id,
        family_id,
        current_responsible_id,
        started_at,
        version,
        updated_at
    )
    values (
        v_child_id,
        p_family_id,
        v_member_id,
        v_now,
        1,
        v_now
    );

    insert into public.responsibility_periods (
        child_id,
        family_id,
        responsible_id,
        actual_start_at,
        started_by,
        created_at
    )
    values (
        v_child_id,
        p_family_id,
        v_member_id,
        v_now,
        v_member_id,
        v_now
    );

    perform public._complete_idempotent_request(
        'create_child',
        p_idempotency_key,
        jsonb_build_object(
            'child_id', v_child_id
        )
    );

    return v_child_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_family(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_family_id uuid;
    v_now timestamptz := pg_catalog.now();
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_name is null or pg_catalog.btrim(p_name) = '' then
        raise exception 'Family name cannot be empty'
            using errcode = '22023';
    end if;

    -- Create family
    insert into public.families (
        name,
        created_by,
        created_at,
        updated_at
    )
    values (
        pg_catalog.btrim(p_name),
        v_user_id,
        v_now,
        v_now
    )
    returning id into v_family_id;

    -- Add creator as the primary parent
    insert into public.family_members (
        family_id,
        user_id,
        role,
        status,
        joined_at
    )
    values (
        v_family_id,
        v_user_id,
        'PRIMARY_PARENT',
        'ACTIVE',
        v_now
    );

    return v_family_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_family_invitation(p_family_id uuid, p_token uuid, p_member_role text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_member_id uuid;
    v_expires_at timestamptz := now() + interval '7 days';
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;
    if p_token is null then
        raise exception 'Invitation token is required' using errcode = '22023';
    end if;
    if p_member_role is null or p_member_role not in ('CO_PARENT', 'CAREGIVER') then
        raise exception 'Invitation role must be CO_PARENT or CAREGIVER' using errcode = '22023';
    end if;

    select fm.id into v_member_id
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE'
    limit 1;

    if v_member_id is null then
        raise exception 'Active family membership required' using errcode = '42501';
    end if;

    insert into public.family_invitations (
        token, family_id, created_by_member_id, member_role, expires_at
    ) values (
        p_token, p_family_id, v_member_id, p_member_role, v_expires_at
    );

    return v_expires_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_responsibility_plan(p_child_id uuid, p_responsible_id uuid, p_planned_start_at timestamp with time zone, p_planned_end_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_family_id uuid;
    v_creator_id uuid;
    v_target_id uuid;
    v_plan_id uuid;
    v_status public.responsibility_plan_status;
    v_accepted_by uuid;
    v_accepted_at timestamptz;
    v_now timestamptz := pg_catalog.now();
    v_idem record;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_idempotency_key is null then
        raise exception 'Idempotency key is required'
            using errcode = '22023';
    end if;

    select *
    into v_idem
    from public._begin_idempotent_request(
        'create_responsibility_plan',
        p_idempotency_key,
        jsonb_build_object(
            'child_id', p_child_id,
            'responsible_id', p_responsible_id,
            'planned_start_epoch',
                extract(epoch from p_planned_start_at),
            'planned_end_epoch',
                extract(epoch from p_planned_end_at)
        )
    );

    if v_idem.is_replay then
        return (v_idem.cached_response->>'plan_id')::uuid;
    end if;

    if p_planned_start_at is null
       or p_planned_end_at is null
       or p_planned_end_at <= p_planned_start_at then
        raise exception 'Invalid planned time range'
            using errcode = '22023';
    end if;

    if p_planned_start_at <= v_now then
        raise exception 'Plan must start in the future'
            using errcode = '22023';
    end if;

    select fm.id, c.family_id
    into v_creator_id, v_family_id
    from public.children c
    join public.family_members fm
      on fm.family_id = c.family_id
     and fm.user_id = v_user_id
     and fm.status = 'ACTIVE'
    where c.id = p_child_id;

    if v_creator_id is null then
        raise exception 'Child not found or active membership required'
            using errcode = '42501';
    end if;

    select fm.id
    into v_target_id
    from public.family_members fm
    where fm.id = p_responsible_id
      and fm.family_id = v_family_id
      and fm.status = 'ACTIVE';

    if v_target_id is null then
        raise exception 'Planned responsible member must be active in the same family'
            using errcode = '22023';
    end if;

    if v_creator_id = v_target_id then
        v_status := 'SCHEDULED';
        v_accepted_by := v_target_id;
        v_accepted_at := v_now;
    else
        v_status := 'PENDING_ACCEPTANCE';
        v_accepted_by := null;
        v_accepted_at := null;
    end if;

    insert into public.responsibility_plans (
        child_id,
        family_id,
        responsible_id,
        created_by,
        planned_start_at,
        planned_end_at,
        status,
        accepted_by,
        accepted_at,
        created_at,
        updated_at
    )
    values (
        p_child_id,
        v_family_id,
        v_target_id,
        v_creator_id,
        p_planned_start_at,
        p_planned_end_at,
        v_status,
        v_accepted_by,
        v_accepted_at,
        v_now,
        v_now
    )
    returning id into v_plan_id;

    perform public._complete_idempotent_request(
        'create_responsibility_plan',
        p_idempotency_key,
        jsonb_build_object(
            'plan_id', v_plan_id
        )
    );

    return v_plan_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decline_handover(p_handover_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where fm.id = v_handover.to_parent_id
      and fm.family_id = v_handover.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Only the intended recipient can decline this handover'
            using errcode = '42501';
    end if;

    update public.handovers
    set status = 'DECLINED'
    where id = p_handover_id;

    return p_handover_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decline_responsibility_plan(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_plan record;
    v_member_id uuid;
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

    if v_plan.status <> 'PENDING_ACCEPTANCE' then
        raise exception 'Plan is not awaiting acceptance'
            using errcode = 'P0001';
    end if;

    select fm.id
    into v_member_id
    from public.family_members fm
    where fm.id = v_plan.responsible_id
      and fm.family_id = v_plan.family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_member_id is null then
        raise exception 'Only the intended responsible member can decline this plan'
            using errcode = '42501';
    end if;

    update public.responsibility_plans
    set status = 'DECLINED',
        updated_at = pg_catalog.now()
    where id = p_plan_id;

    return p_plan_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_account_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_families jsonb;
    v_display_name text;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    select up.display_name into v_display_name
    from public.user_profiles up
    where up.user_id = v_user_id;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', f.id,
                'name', f.name,
                'role', mine.role,
                'joined_at', mine.joined_at,
                'members', (
                    select coalesce(
                        jsonb_agg(
                            jsonb_build_object(
                                'role', fm.role,
                                'is_you', fm.user_id = v_user_id,
                                'display_name', up.display_name,
                                'joined_at', fm.joined_at
                            ) order by fm.created_at
                        ),
                        '[]'::jsonb
                    )
                    from public.family_members fm
                    left join public.user_profiles up on up.user_id = fm.user_id
                    where fm.family_id = f.id
                      and fm.status = 'ACTIVE'
                ),
                'children', (
                    select coalesce(
                        jsonb_agg(
                            jsonb_build_object(
                                'id', c.id,
                                'name', c.name,
                                'birth_date', c.birth_date
                            ) order by c.name
                        ),
                        '[]'::jsonb
                    )
                    from public.children c
                    where c.family_id = f.id
                )
            ) order by f.created_at desc
        ),
        '[]'::jsonb
    ) into v_families
    from public.family_members mine
    join public.families f on f.id = mine.family_id
    where mine.user_id = v_user_id
      and mine.status = 'ACTIVE';

    return jsonb_build_object(
        'user', jsonb_build_object(
            'id', v_user_id,
            'email', auth.jwt() ->> 'email',
            'display_name', v_display_name
        ),
        'families', v_families
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_responsibility_snapshot(p_child_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_family_id uuid;
    v_current_user_member_id uuid;
    v_result jsonb;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    -- Resolve child and family
    select c.family_id
    into v_family_id
    from public.children c
    where c.id = p_child_id;

    if v_family_id is null then
        raise exception 'Child not found'
            using errcode = 'P0002';
    end if;

    -- Verify active family membership
    select fm.id
    into v_current_user_member_id
    from public.family_members fm
    where fm.family_id = v_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_current_user_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    -- Build the entire snapshot in one SQL statement.
    -- This gives all nested data the same statement snapshot.
    select jsonb_build_object(

        'child',
        (
            select jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'birth_date', c.birth_date
            )
            from public.children c
            where c.id = p_child_id
        ),

        'current_user_member_id',
        v_current_user_member_id,

        'responsibility',
        (
            select jsonb_build_object(
                'current_responsible_id',
                    r.current_responsible_id,
                'responsible_user_id',
                    fm.user_id,
                'responsible_role',
                    fm.role,
                'started_at',
                    r.started_at,
                'version',
                    r.version,
                'updated_at',
                    r.updated_at
            )
            from public.responsibilities r
            join public.family_members fm
              on fm.id = r.current_responsible_id
             and fm.family_id = r.family_id
            where r.child_id = p_child_id
        ),

        'active_period',
        (
            select jsonb_build_object(
                'id', rp.id,
                'responsible_id', rp.responsible_id,
                'actual_start_at', rp.actual_start_at,
                'started_by', rp.started_by
            )
            from public.responsibility_periods rp
            where rp.child_id = p_child_id
              and rp.actual_end_at is null
            limit 1
        ),

        'next_plan',
        (
            select jsonb_build_object(
                'id', rp.id,
                'responsible_id', rp.responsible_id,
                'responsible_user_id', fm.user_id,
                'responsible_role', fm.role,
                'planned_start_at', rp.planned_start_at,
                'planned_end_at', rp.planned_end_at,
                'status', rp.status,
                'created_by', rp.created_by
            )
            from public.responsibility_plans rp
            join public.family_members fm
              on fm.id = rp.responsible_id
             and fm.family_id = rp.family_id
            where rp.child_id = p_child_id
              and rp.status = 'SCHEDULED'
              and rp.planned_end_at > pg_catalog.statement_timestamp()
            order by rp.planned_start_at
            limit 1
        ),

        'pending_plan',
        (
            select jsonb_build_object(
                'id', rp.id,
                'responsible_id', rp.responsible_id,
                'responsible_user_id', fm.user_id,
                'planned_start_at', rp.planned_start_at,
                'planned_end_at', rp.planned_end_at,
                'created_by', rp.created_by,
                'created_at', rp.created_at
            )
            from public.responsibility_plans rp
            join public.family_members fm
              on fm.id = rp.responsible_id
             and fm.family_id = rp.family_id
            where rp.child_id = p_child_id
              and rp.status = 'PENDING_ACCEPTANCE'
            order by rp.planned_start_at
            limit 1
        ),

        'pending_handover',
        (
            select jsonb_build_object(
                'id', h.id,
                'from_parent_id', h.from_parent_id,
                'to_parent_id', h.to_parent_id,
                'initiated_by', h.initiated_by,
                'type', h.type,
                'requested_at', h.requested_at
            )
            from public.handovers h
            where h.child_id = p_child_id
              and h.status = 'PENDING'
            order by h.requested_at
            limit 1
        ),

        'planned_relief_window',
        (
            select jsonb_build_object(
                'status', 'PLANNED',
                'starts_at', rp.planned_start_at,
                'ends_at', rp.planned_end_at,
                'responsible_id', rp.responsible_id,
                'seconds_until_start',
                    greatest(
                        0,
                        extract(
                            epoch from (
                                rp.planned_start_at
                                - pg_catalog.statement_timestamp()
                            )
                        )
                    )
            )
            from public.responsibility_plans rp
            join public.responsibilities r
              on r.child_id = rp.child_id
            where rp.child_id = p_child_id
              and rp.status = 'SCHEDULED'
              and rp.responsible_id <> r.current_responsible_id
              and rp.planned_end_at > pg_catalog.statement_timestamp()
            order by rp.planned_start_at
            limit 1
        ),

        'server_time',
        pg_catalog.statement_timestamp()

    )
    into v_result;

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_active_family_member(p_family_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1
        from public.family_members fm
        where fm.family_id = p_family_id
          and fm.user_id = (select auth.uid())
          and fm.status = 'ACTIVE'
    );
$function$;

CREATE OR REPLACE FUNCTION public.process_due_responsibility_plans()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_plan public.responsibility_plans%rowtype;
    v_current_member_id uuid;
    v_actor_id uuid;
    v_active_period_start timestamptz;
    v_transition_at timestamptz;
    v_processed integer := 0;
begin
    update public.responsibility_plans
    set status = 'NOT_STARTED',
        updated_at = pg_catalog.now()
    where status = 'SCHEDULED'
      and planned_start_at <= pg_catalog.now()
      and planned_end_at <= pg_catalog.now();

    for v_plan in
        select rp.*
        from public.responsibility_plans rp
        where rp.status = 'SCHEDULED'
          and rp.planned_start_at <= pg_catalog.now()
          and rp.planned_end_at > pg_catalog.now()
        order by rp.planned_start_at, rp.created_at
        for update skip locked
    loop
        select r.current_responsible_id
          into v_current_member_id
        from public.responsibilities r
        where r.child_id = v_plan.child_id
          and r.family_id = v_plan.family_id
        for update;

        if v_current_member_id is null then
            raise warning 'Skipping responsibility plan %: current responsibility row is missing', v_plan.id;
            continue;
        end if;

        select p.actual_start_at
          into v_active_period_start
        from public.responsibility_periods p
        where p.child_id = v_plan.child_id
          and p.family_id = v_plan.family_id
          and p.actual_end_at is null
        order by p.actual_start_at desc
        limit 1
        for update;

        v_transition_at := greatest(
            v_plan.planned_start_at,
            pg_catalog.clock_timestamp(),
            v_active_period_start + interval '1 microsecond'
        );
        v_actor_id := coalesce(v_plan.accepted_by, v_plan.created_by);

        update public.responsibility_plans
        set previous_responsible_id = v_current_member_id,
            status = 'IN_PROGRESS',
            updated_at = pg_catalog.now()
        where id = v_plan.id;

        if v_current_member_id <> v_plan.responsible_id then
            update public.responsibility_periods
            set actual_end_at = v_transition_at,
                ended_by = v_actor_id
            where child_id = v_plan.child_id
              and family_id = v_plan.family_id
              and actual_end_at is null;

            update public.responsibilities
            set current_responsible_id = v_plan.responsible_id,
                started_at = v_transition_at,
                version = version + 1,
                updated_at = pg_catalog.now()
            where child_id = v_plan.child_id
              and family_id = v_plan.family_id;

            insert into public.responsibility_periods (
                child_id, family_id, responsible_id, actual_start_at, started_by, created_at
            ) values (
                v_plan.child_id, v_plan.family_id, v_plan.responsible_id,
                v_transition_at, v_actor_id, pg_catalog.now()
            );
        end if;
        v_processed := v_processed + 1;
    end loop;

    for v_plan in
        select rp.*
        from public.responsibility_plans rp
        where rp.status = 'IN_PROGRESS'
          and rp.planned_end_at <= pg_catalog.now()
        order by rp.planned_end_at, rp.created_at
        for update skip locked
    loop
        select r.current_responsible_id
          into v_current_member_id
        from public.responsibilities r
        where r.child_id = v_plan.child_id
          and r.family_id = v_plan.family_id
        for update;

        select p.actual_start_at
          into v_active_period_start
        from public.responsibility_periods p
        where p.child_id = v_plan.child_id
          and p.family_id = v_plan.family_id
          and p.actual_end_at is null
        order by p.actual_start_at desc
        limit 1
        for update;

        v_transition_at := greatest(
            v_plan.planned_end_at,
            pg_catalog.clock_timestamp(),
            v_active_period_start + interval '1 microsecond'
        );
        v_actor_id := coalesce(v_plan.accepted_by, v_plan.created_by);

        if v_plan.previous_responsible_id is not null
           and v_current_member_id = v_plan.responsible_id
           and v_current_member_id <> v_plan.previous_responsible_id then
            update public.responsibility_periods
            set actual_end_at = v_transition_at,
                ended_by = v_actor_id
            where child_id = v_plan.child_id
              and family_id = v_plan.family_id
              and actual_end_at is null;

            update public.responsibilities
            set current_responsible_id = v_plan.previous_responsible_id,
                started_at = v_transition_at,
                version = version + 1,
                updated_at = pg_catalog.now()
            where child_id = v_plan.child_id
              and family_id = v_plan.family_id;

            insert into public.responsibility_periods (
                child_id, family_id, responsible_id, actual_start_at, started_by, created_at
            ) values (
                v_plan.child_id, v_plan.family_id, v_plan.previous_responsible_id,
                v_transition_at, v_actor_id, pg_catalog.now()
            );
        end if;

        update public.responsibility_plans
        set status = 'COMPLETED',
            updated_at = pg_catalog.now()
        where id = v_plan.id;
        v_processed := v_processed + 1;
    end loop;

    return v_processed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_handover(p_child_id uuid, p_to_member_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
    v_family_id uuid;
    v_current_member_id uuid;
    v_requester_member_id uuid;
    v_target_member_id uuid;
    v_handover_id uuid;
    v_idem record;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_idempotency_key is null then
        raise exception 'Idempotency key is required'
            using errcode = '22023';
    end if;

    select
        r.family_id,
        r.current_responsible_id
    into
        v_family_id,
        v_current_member_id
    from public.responsibilities r
    where r.child_id = p_child_id
    for update;

    if not found then
        raise exception 'Responsibility record not found'
            using errcode = 'P0002';
    end if;

    select fm.id
    into v_requester_member_id
    from public.family_members fm
    where fm.family_id = v_family_id
      and fm.user_id = v_user_id
      and fm.status = 'ACTIVE';

    if v_requester_member_id is null then
        raise exception 'Active family membership required'
            using errcode = '42501';
    end if;

    select *
    into v_idem
    from public._begin_idempotent_request(
        'request_handover',
        p_idempotency_key,
        jsonb_build_object(
            'child_id', p_child_id,
            'to_member_id', p_to_member_id
        )
    );

    if v_idem.is_replay then
        return (v_idem.cached_response->>'handover_id')::uuid;
    end if;

    if v_current_member_id <> v_requester_member_id then
        raise exception 'Only current responsible member can request handover'
            using errcode = '42501';
    end if;

    select fm.id
    into v_target_member_id
    from public.family_members fm
    where fm.id = p_to_member_id
      and fm.family_id = v_family_id
      and fm.status = 'ACTIVE';

    if v_target_member_id is null then
        raise exception 'Target must be an active member of the same family'
            using errcode = '22023';
    end if;

    if v_target_member_id = v_requester_member_id then
        raise exception 'Cannot request handover to yourself'
            using errcode = '22023';
    end if;

    insert into public.handovers (
        child_id,
        family_id,
        from_parent_id,
        to_parent_id,
        initiated_by,
        type,
        status
    )
    values (
        p_child_id,
        v_family_id,
        v_current_member_id,
        v_target_member_id,
        v_requester_member_id,
        'IMMEDIATE',
        'PENDING'
    )
    returning id into v_handover_id;

    perform public._complete_idempotent_request(
        'request_handover',
        p_idempotency_key,
        jsonb_build_object(
            'handover_id', v_handover_id
        )
    );

    return v_handover_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_display_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_display_name text := btrim(p_display_name);
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;
    if v_display_name is null or v_display_name = '' then
        raise exception 'Display name cannot be empty' using errcode = '22023';
    end if;
    if length(v_display_name) > 80 then
        raise exception 'Display name cannot exceed 80 characters' using errcode = '22023';
    end if;

    insert into public.user_profiles (user_id, display_name, created_at, updated_at)
    values (v_user_id, v_display_name, now(), now())
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          updated_at = excluded.updated_at;
end;
$function$;

-- Authenticated users can read family data only through active-family RLS.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.children enable row level security;
alter table public.responsibilities enable row level security;
alter table public.responsibility_periods enable row level security;
alter table public.responsibility_plans enable row level security;
alter table public.handovers enable row level security;
alter table public.idempotency_requests enable row level security;
alter table public.family_invitations enable row level security;
alter table public.user_profiles enable row level security;

grant select on public.families, public.family_members, public.children,
    public.responsibilities, public.responsibility_periods,
    public.responsibility_plans, public.handovers, public.user_profiles
to authenticated;
revoke all on public.idempotency_requests, public.family_invitations
from public, anon, authenticated;

create policy families_read_active_members on public.families
    for select to authenticated using (public.is_active_family_member(id));
create policy family_members_read_active_family on public.family_members
    for select to authenticated using (
        status = 'ACTIVE' and public.is_active_family_member(family_id)
    );
create policy children_read_active_family on public.children
    for select to authenticated using (public.is_active_family_member(family_id));
create policy responsibilities_read_active_family on public.responsibilities
    for select to authenticated using (public.is_active_family_member(family_id));
create policy responsibility_periods_read_active_family on public.responsibility_periods
    for select to authenticated using (public.is_active_family_member(family_id));
create policy responsibility_plans_read_active_family on public.responsibility_plans
    for select to authenticated using (public.is_active_family_member(family_id));
create policy handovers_read_active_family on public.handovers
    for select to authenticated using (public.is_active_family_member(family_id));
create policy user_profiles_read_self_or_family on public.user_profiles
    for select to authenticated using (public.can_read_user_profile(user_id));

-- Public API RPCs.
revoke all on function public.accept_family_invitation(uuid) from public, anon;
revoke all on function public.accept_handover(uuid, uuid) from public, anon;
revoke all on function public.accept_responsibility(uuid, uuid) from public, anon;
revoke all on function public.accept_responsibility_plan(uuid) from public, anon;
revoke all on function public.cancel_handover(uuid) from public, anon;
revoke all on function public.cancel_responsibility_plan(uuid) from public, anon;
revoke all on function public.create_child(uuid, text, date, uuid) from public, anon;
revoke all on function public.create_family(text) from public, anon;
revoke all on function public.create_family_invitation(uuid, uuid, text) from public, anon;
revoke all on function public.create_responsibility_plan(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.decline_handover(uuid) from public, anon;
revoke all on function public.decline_responsibility_plan(uuid) from public, anon;
revoke all on function public.get_my_account_snapshot() from public, anon;
revoke all on function public.get_responsibility_snapshot(uuid) from public, anon;
revoke all on function public.request_handover(uuid, uuid, uuid) from public, anon;
revoke all on function public.upsert_my_profile(text) from public, anon;

grant execute on function public.accept_family_invitation(uuid) to authenticated;
grant execute on function public.accept_handover(uuid, uuid) to authenticated;
grant execute on function public.accept_responsibility(uuid, uuid) to authenticated;
grant execute on function public.accept_responsibility_plan(uuid) to authenticated;
grant execute on function public.cancel_handover(uuid) to authenticated;
grant execute on function public.cancel_responsibility_plan(uuid) to authenticated;
grant execute on function public.create_child(uuid, text, date, uuid) to authenticated;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.create_family_invitation(uuid, uuid, text) to authenticated;
grant execute on function public.create_responsibility_plan(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.decline_handover(uuid) to authenticated;
grant execute on function public.decline_responsibility_plan(uuid) to authenticated;
grant execute on function public.get_my_account_snapshot() to authenticated;
grant execute on function public.get_responsibility_snapshot(uuid) to authenticated;
grant execute on function public.request_handover(uuid, uuid, uuid) to authenticated;
grant execute on function public.upsert_my_profile(text) to authenticated;

revoke all on function public._begin_idempotent_request(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._complete_idempotent_request(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._transfer_responsibility(uuid, uuid, uuid, uuid, uuid, public.handover_type) from public, anon, authenticated;
revoke all on function public.process_due_responsibility_plans() from public, anon, authenticated;
grant execute on function public.process_due_responsibility_plans() to postgres;
revoke all on function public.can_read_user_profile(uuid) from public, anon;
revoke all on function public.is_active_family_member(uuid) from public, anon;
grant execute on function public.can_read_user_profile(uuid) to authenticated;
grant execute on function public.is_active_family_member(uuid) to authenticated;

select cron.schedule(
    'process-due-responsibility-plans',
    '* * * * *',
    'select public.process_due_responsibility_plans()'
);

-- The mobile app listens for responsibility and plan changes while open.
do $$
declare
    v_table text;
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        foreach v_table in array array['responsibilities', 'responsibility_plans', 'handovers'] loop
            if not exists (
                select 1 from pg_publication_tables
                where pubname = 'supabase_realtime'
                  and schemaname = 'public'
                  and tablename = v_table
            ) then
                execute format('alter publication supabase_realtime add table public.%I', v_table);
            end if;
        end loop;
    end if;
end;
$$;

notify pgrst, 'reload schema';
