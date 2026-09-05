-- Production hardening: align the committed schema with the API adapter,
-- restore lease liveness, and close direct-RPC authorization bypasses.

begin;

create table if not exists public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_roles (user_id, role)
select
  profile.id,
  case when coalesce(auth_user.raw_app_meta_data ->> 'role', 'operator') = 'admin' then 'admin' else 'operator' end
from public.profiles profile
left join auth.users auth_user on auth_user.id = profile.id
on conflict (user_id) do nothing;

alter table public.user_roles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    (select role = 'admin' from public.user_roles where user_id = auth.uid()),
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

drop policy if exists "Users read own role" on public.user_roles;
create policy "Users read own role"
  on public.user_roles for select
  using (auth.uid() = user_id);

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles"
  on public.user_roles for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when coalesce(new.raw_app_meta_data ->> 'role', 'operator') = 'admin' then 'admin' else 'operator' end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create index if not exists idx_assignments_user_expiry
  on public.account_assignments (user_id, expires_at)
  where status = 'active';

create unique index if not exists idx_accounts_external_id_ci
  on public.accounts (lower(external_id));

create index if not exists idx_sessions_liveness
  on public.account_sessions (last_heartbeat_at)
  where status in ('starting', 'active', 'stopping');

-- Only the server-side service role may call explicit-actor RPCs or move Riot
-- session material. Direct authenticated clients must go through the API,
-- where device signatures and current roles are checked.
revoke all on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) from authenticated;
revoke all on function public.heartbeat_account_session_for_user(uuid, uuid, text) from authenticated;
revoke all on function public.release_account_lease_for_user(uuid, uuid, text, boolean) from authenticated;
revoke all on function public.save_account_session_blob(uuid, text) from authenticated;
revoke all on function public.get_account_session_blob_for_user(uuid, uuid) from authenticated;
revoke all on function public.delete_account_session_blob(uuid) from authenticated;
revoke all on function public.save_account_session_blob(uuid, text) from service_role;
revoke all on function public.get_account_session_blob_for_user(uuid, uuid) from service_role;
revoke all on function public.delete_account_session_blob(uuid) from service_role;

revoke all on function public.acquire_account_lease(uuid, uuid) from authenticated;
revoke all on function public.heartbeat_account_session(uuid, text) from authenticated;
revoke all on function public.release_account_lease(uuid, text) from authenticated;

grant execute on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.heartbeat_account_session_for_user(uuid, uuid, text) to service_role;
grant execute on function public.release_account_lease_for_user(uuid, uuid, text, boolean) to service_role;
grant execute on function public.save_account_session_blob(uuid, text) to service_role;
grant execute on function public.get_account_session_blob_for_user(uuid, uuid) to service_role;
grant execute on function public.delete_account_session_blob(uuid) to service_role;

create or replace function public.heartbeat_account_session_for_user(
  p_user_id uuid,
  p_session_id uuid,
  p_runtime_state text default 'IN_CLIENT'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
  v_role text;
begin
  if p_runtime_state not in ('LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED') then
    return jsonb_build_object('success', false, 'code', 'INVALID_RUNTIME_STATE');
  end if;

  select account_id into v_account_id
  from public.account_sessions
  where id = p_session_id
    and user_id = p_user_id
    and status in ('starting', 'active')
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  select role into v_role from public.user_roles where user_id = p_user_id;
  if coalesce(v_role, 'operator') <> 'admin' and not exists (
    select 1 from public.account_assignments
    where account_id = v_account_id
      and user_id = p_user_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
  ) then
    update public.account_sessions
    set status = 'ended', runtime_state = 'EXITED', ended_at = now(), release_reason = 'error'
    where id = p_session_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    values (p_user_id, 'SESSION_ENDED', 'account_sessions', p_session_id, jsonb_build_object('account_id', v_account_id, 'release_reason', 'assignment_expired'));
    return jsonb_build_object('success', false, 'code', 'ASSIGNMENT_EXPIRED');
  end if;

  if p_runtime_state = 'EXITED' then
    update public.account_sessions
    set status = 'ended',
        runtime_state = 'EXITED',
        ended_at = now(),
        release_reason = 'process_exit'
    where id = p_session_id
      and user_id = p_user_id
      and status in ('starting', 'active');
  else
    update public.account_sessions
    set status = 'active',
        runtime_state = p_runtime_state,
        last_heartbeat_at = now(),
        reconnect_grace_until = case when p_runtime_state = 'RECONNECTING' then now() + interval '300 seconds' else null end
    where id = p_session_id
      and user_id = p_user_id
      and status in ('starting', 'active');
  end if;

  if p_runtime_state = 'EXITED' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    values (p_user_id, 'SESSION_ENDED', 'account_sessions', p_session_id, jsonb_build_object('release_reason', 'process_exit'));
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.heartbeat_account_session_for_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.heartbeat_account_session_for_user(uuid, uuid, text) to service_role;

create or replace function public.reap_stale_account_sessions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session record;
  v_count integer := 0;
begin
  for v_session in
    update public.account_sessions
    set status = 'stale',
        ended_at = now(),
        release_reason = 'heartbeat_timeout',
        runtime_state = 'EXITED'
    where status in ('starting', 'active', 'stopping')
      and last_heartbeat_at < (now() - interval '120 seconds')
      and (reconnect_grace_until is null or reconnect_grace_until <= now())
    returning id, user_id, account_id
  loop
    v_count := v_count + 1;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    values (v_session.user_id, 'SESSION_LAZILY_REAPED', 'account_sessions', v_session.id, jsonb_build_object('account_id', v_session.account_id, 'reason', 'heartbeat_timeout'));
  end loop;
  return v_count;
end;
$$;

revoke all on function public.reap_stale_account_sessions() from public, anon, authenticated;
grant execute on function public.reap_stale_account_sessions() to service_role;

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
set search_path = pg_catalog, public
as $$
declare
  v_is_admin boolean;
  v_session public.account_sessions%rowtype;
  v_session_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'ACCOUNT_DISABLED');
  end if;

  select coalesce((select role = 'admin' from public.user_roles where user_id = p_user_id), false)
    into v_is_admin;

  if not v_is_admin and not exists (
    select 1 from public.account_assignments
    where account_id = p_account_id
      and user_id = p_user_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
  ) then
    return jsonb_build_object('success', false, 'code', 'NO_ACTIVE_ASSIGNMENT');
  end if;

  if not exists (select 1 from public.user_devices where id = p_device_id and user_id = p_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'DEVICE_NOT_AUTHORIZED');
  end if;

  perform 1 from public.accounts where id = p_account_id and status = 'available' for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'ACCOUNT_UNAVAILABLE');
  end if;

  select * into v_session
  from public.account_sessions
  where account_id = p_account_id and status in ('starting', 'active', 'stopping')
  for update;

  if found then
    if v_session.last_heartbeat_at < (now() - interval '120 seconds')
       and (v_session.reconnect_grace_until is null or v_session.reconnect_grace_until <= now()) then
      update public.account_sessions
      set status = 'stale', runtime_state = 'EXITED', ended_at = now(), release_reason = 'heartbeat_timeout'
      where id = v_session.id;
    elsif v_session.user_id = p_user_id and v_session.device_id = p_device_id then
      return jsonb_build_object('success', true, 'session_id', v_session.id, 'is_reconnect', true);
    else
      return jsonb_build_object('success', false, 'code', 'ACCOUNT_BUSY');
    end if;
  end if;

  insert into public.account_sessions (account_id, user_id, device_id, status, runtime_state, last_heartbeat_at)
  values (p_account_id, p_user_id, p_device_id, 'active', 'LAUNCHING', now())
  returning id into v_session_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (p_user_id, 'SESSION_STARTED', 'account_sessions', v_session_id, jsonb_build_object('account_id', p_account_id, 'device_id', p_device_id, 'signed', p_nonce is not null and p_signature is not null));

  return jsonb_build_object('success', true, 'session_id', v_session_id, 'is_reconnect', false);
end;
$$;

create or replace function public.release_account_lease_for_user(
  p_actor_id uuid,
  p_session_id uuid,
  p_reason text default 'manual',
  p_is_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.account_sessions%rowtype;
  v_is_admin boolean;
begin
  if p_actor_id is null then
    return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  end if;
  select coalesce((select role = 'admin' from public.user_roles where user_id = p_actor_id), false)
    into v_is_admin;
  select * into v_session from public.account_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND');
  end if;
  if v_session.user_id <> p_actor_id and not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if p_reason not in ('manual', 'logout', 'lease_timeout', 'admin_force_release', 'error') then
    return jsonb_build_object('success', false, 'code', 'INVALID_RELEASE_REASON');
  end if;

  update public.account_sessions
  set status = 'ended', runtime_state = 'EXITED', ended_at = now(),
      release_reason = case when v_is_admin and v_session.user_id <> p_actor_id then 'admin_force_release' else p_reason end
  where id = p_session_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (p_actor_id, 'SESSION_ENDED', 'account_sessions', p_session_id, jsonb_build_object('release_reason', p_reason));

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_account_lease_for_user(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.release_account_lease_for_user(uuid, uuid, text, boolean) to service_role;

commit;
