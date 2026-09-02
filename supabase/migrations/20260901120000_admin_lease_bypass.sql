-- Migration: Allow administrators and active assignees to acquire account leases

create or replace function public.acquire_account_lease(p_account_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_session public.account_sessions%rowtype;
  v_session_id uuid;
begin
  if v_user_id is null then return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED'); end if;

  if not coalesce(v_is_admin, false) and not exists (
    select 1 from public.account_assignments
    where account_id = p_account_id and user_id = v_user_id and status = 'active' and (expires_at is null or expires_at > now())
  ) then
    return jsonb_build_object('success', false, 'code', 'NO_ACTIVE_ASSIGNMENT');
  end if;

  if not exists (select 1 from public.user_devices where id = p_device_id and user_id = v_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'DEVICE_NOT_AUTHORIZED');
  end if;

  perform 1 from public.accounts where id = p_account_id and status = 'available' for update;
  if not found then return jsonb_build_object('success', false, 'code', 'ACCOUNT_UNAVAILABLE'); end if;

  select * into v_session from public.account_sessions
  where account_id = p_account_id and status in ('starting', 'active', 'stopping') for update;

  if found then
    -- Sessions older than 4 hours are automatically expired
    if v_session.started_at < (now() - interval '4 hours') then
      update public.account_sessions set status = 'stale', ended_at = now(), release_reason = 'lease_timeout' where id = v_session.id;
    elsif v_session.user_id = v_user_id and v_session.device_id = p_device_id then
      return jsonb_build_object('success', true, 'session_id', v_session.id, 'is_reconnect', true);
    else
      return jsonb_build_object('success', false, 'code', 'ACCOUNT_BUSY');
    end if;
  end if;

  insert into public.account_sessions (account_id, user_id, device_id, status)
  values (p_account_id, v_user_id, p_device_id, 'active')
  returning id into v_session_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (v_user_id, 'SESSION_STARTED', 'account_sessions', v_session_id, jsonb_build_object('account_id', p_account_id, 'device_id', p_device_id));

  return jsonb_build_object('success', true, 'session_id', v_session_id, 'is_reconnect', false);
end;
$$;

create or replace function public.acquire_account_lease_for_user(
  p_user_id uuid,
  p_account_id uuid,
  p_device_id uuid,
  p_nonce text default null,
  p_signature text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_is_admin boolean := false;
  v_session public.account_sessions%rowtype;
  v_session_id uuid;
begin
  if p_user_id is null then return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED'); end if;

  select coalesce((raw_app_meta_data->>'role') = 'admin', false) into v_is_admin
  from auth.users where id = p_user_id;

  if not coalesce(v_is_admin, false) and not exists (
    select 1 from public.account_assignments
    where account_id = p_account_id and user_id = p_user_id and status = 'active' and (expires_at is null or expires_at > now())
  ) then
    return jsonb_build_object('success', false, 'code', 'NO_ACTIVE_ASSIGNMENT');
  end if;

  if not exists (select 1 from public.user_devices where id = p_device_id and user_id = p_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'DEVICE_NOT_AUTHORIZED');
  end if;

  perform 1 from public.accounts where id = p_account_id and status = 'available' for update;
  if not found then return jsonb_build_object('success', false, 'code', 'ACCOUNT_UNAVAILABLE'); end if;

  select * into v_session from public.account_sessions
  where account_id = p_account_id and status in ('starting', 'active', 'stopping') for update;

  if found then
    -- Sessions older than 4 hours are automatically expired
    if v_session.started_at < (now() - interval '4 hours') then
      update public.account_sessions set status = 'stale', ended_at = now(), release_reason = 'lease_timeout' where id = v_session.id;
    elsif v_session.user_id = p_user_id and v_session.device_id = p_device_id then
      return jsonb_build_object('success', true, 'session_id', v_session.id, 'is_reconnect', true);
    else
      return jsonb_build_object('success', false, 'code', 'ACCOUNT_BUSY');
    end if;
  end if;

  insert into public.account_sessions (account_id, user_id, device_id, status)
  values (p_account_id, p_user_id, p_device_id, 'active')
  returning id into v_session_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (p_user_id, 'SESSION_STARTED', 'account_sessions', v_session_id, jsonb_build_object('account_id', p_account_id, 'device_id', p_device_id));

  return jsonb_build_object('success', true, 'session_id', v_session_id, 'is_reconnect', false);
end;
$$;
