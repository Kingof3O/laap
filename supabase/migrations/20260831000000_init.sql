-- LAAP security boundary. Credentials are stored in Supabase Vault by an Edge
-- Function; this schema intentionally contains no password/token columns.
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";
create extension if not exists "supabase_vault";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_key text not null,
  platform text not null check (platform in ('windows', 'macos')),
  device_name text not null,
  app_version text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, public_key)
);

create table if not exists public.accounts (
  id uuid primary key default uuid_generate_v4(),
  provider text not null default 'riot',
  external_id text not null,
  display_name text not null,
  region text not null,
  status text not null default 'available' check (status in ('available', 'maintenance', 'disabled')),
  vault_secret_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_assignments (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);

create table if not exists public.account_sessions (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.user_devices(id) on delete cascade,
  status text not null default 'starting' check (status in ('starting', 'active', 'stopping', 'ended', 'stale', 'error')),
  runtime_state text not null default 'LAUNCHING' check (runtime_state in ('LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED')),
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  reconnect_grace_until timestamptz,
  release_reason text check (release_reason in ('manual', 'process_exit', 'logout', 'heartbeat_timeout', 'admin_force_release', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create unique index if not exists idx_exclusive_account_session
  on public.account_sessions (account_id)
  where status in ('starting', 'active', 'stopping');
create index if not exists idx_sessions_user_status on public.account_sessions(user_id, status);
create index if not exists idx_assignments_user_active on public.account_assignments(user_id) where status = 'active';

create or replace function public.is_admin()
returns boolean
language sql
stable
as 'select coalesce((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'', false)';

alter table public.profiles enable row level security;
alter table public.user_devices enable row level security;
alter table public.accounts enable row level security;
alter table public.account_assignments enable row level security;
alter table public.account_sessions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Admins full access profiles" on public.profiles;
create policy "Admins full access profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users view assigned accounts" on public.accounts;
create policy "Users view assigned accounts" on public.accounts for select using (
  exists (select 1 from public.account_assignments aa where aa.account_id = accounts.id and aa.user_id = auth.uid() and aa.status = 'active' and (aa.expires_at is null or aa.expires_at > now()))
);
drop policy if exists "Admins full access accounts" on public.accounts;
create policy "Admins full access accounts" on public.accounts for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own assignments" on public.account_assignments;
create policy "Users read own assignments" on public.account_assignments for select using (user_id = auth.uid());
drop policy if exists "Admins full access assignments" on public.account_assignments;
create policy "Admins full access assignments" on public.account_assignments for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own devices" on public.user_devices;
create policy "Users read own devices" on public.user_devices for select using (user_id = auth.uid());
drop policy if exists "Admins full access devices" on public.user_devices;
create policy "Admins full access devices" on public.user_devices for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own sessions" on public.account_sessions;
create policy "Users read own sessions" on public.account_sessions for select using (user_id = auth.uid());
drop policy if exists "Admins full access sessions" on public.account_sessions;
create policy "Admins full access sessions" on public.account_sessions for all using (public.is_admin()) with check (public.is_admin());

-- Never expose Vault linkage through PostgREST. Account writes and credential
-- changes go through authenticated Edge Functions/service-role RPCs; clients
-- receive only the non-sensitive account directory columns below.
revoke all on public.accounts from anon, authenticated;
grant select (id, provider, external_id, display_name, region, status, metadata, created_at, updated_at) on public.accounts to authenticated;
revoke insert, update, delete on public.accounts from anon, authenticated;
revoke insert, update, delete on public.account_sessions from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;

do $publication$
begin
  begin
    alter publication supabase_realtime add table public.account_sessions;
  exception when duplicate_object then
    null;
  end;
end;
$publication$;

drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs for select using (public.is_admin());

create or replace function public.acquire_account_lease(p_account_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.account_sessions%rowtype;
  v_session_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  end if;
  if not exists (select 1 from public.account_assignments where account_id = p_account_id and user_id = v_user_id and status = 'active' and (expires_at is null or expires_at > now())) then
    return jsonb_build_object('success', false, 'code', 'NO_ACTIVE_ASSIGNMENT');
  end if;
  if not exists (select 1 from public.user_devices where id = p_device_id and user_id = v_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'DEVICE_NOT_AUTHORIZED');
  end if;
  perform 1 from public.accounts where id = p_account_id and status = 'available' for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'ACCOUNT_UNAVAILABLE');
  end if;
  select * into v_session from public.account_sessions where account_id = p_account_id and status in ('starting', 'active', 'stopping') for update;
  if found then
    if v_session.last_heartbeat_at < (now() - interval '90 seconds') and (v_session.reconnect_grace_until is null or v_session.reconnect_grace_until <= now()) then
      update public.account_sessions set status = 'stale', ended_at = now(), release_reason = 'heartbeat_timeout' where id = v_session.id;
    elsif v_session.user_id = v_user_id and v_session.device_id = p_device_id then
      return jsonb_build_object('success', true, 'session_id', v_session.id, 'is_reconnect', true);
    else
      return jsonb_build_object('success', false, 'code', 'ACCOUNT_BUSY');
    end if;
  end if;
  insert into public.account_sessions (account_id, user_id, device_id) values (p_account_id, v_user_id, p_device_id) returning id into v_session_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload) values (v_user_id, 'SESSION_STARTED', 'account_sessions', v_session_id, jsonb_build_object('account_id', p_account_id, 'device_id', p_device_id));
  return jsonb_build_object('success', true, 'session_id', v_session_id, 'is_reconnect', false);
end;
$$;

create or replace function public.heartbeat_account_session(p_session_id uuid, p_runtime_state text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.account_sessions set last_heartbeat_at = now(), runtime_state = p_runtime_state, reconnect_grace_until = case when p_runtime_state = 'RECONNECTING' then now() + interval '300 seconds' else null end where id = p_session_id and user_id = auth.uid() and status in ('starting', 'active');
  if not found then return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.release_account_lease(p_session_id uuid, p_reason text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_session public.account_sessions%rowtype; v_admin boolean := public.is_admin();
begin
  select * into v_session from public.account_sessions where id = p_session_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); end if;
  if v_session.user_id <> auth.uid() and not v_admin then return jsonb_build_object('success', false, 'code', 'FORBIDDEN'); end if;
  update public.account_sessions set status = 'ended', ended_at = now(), release_reason = case when v_admin and v_session.user_id <> auth.uid() then 'admin_force_release' else p_reason end where id = p_session_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload) values (auth.uid(), 'SESSION_ENDED', 'account_sessions', p_session_id, jsonb_build_object('release_reason', p_reason));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.acquire_account_lease(uuid, uuid) from public;
revoke all on function public.heartbeat_account_session(uuid, text) from public;
revoke all on function public.release_account_lease(uuid, text) from public;
grant execute on function public.acquire_account_lease(uuid, uuid) to authenticated;
grant execute on function public.heartbeat_account_session(uuid, text) to authenticated;
grant execute on function public.release_account_lease(uuid, text) to authenticated;

-- Service-role API adapters use explicit actor IDs after validating the caller
-- JWT in the API. These variants keep the database transaction/lock semantics
-- for deployments that terminate HTTP at a separate API service.
create or replace function public.acquire_account_lease_for_user(p_user_id uuid, p_account_id uuid, p_device_id uuid, p_nonce text default null, p_signature text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_session public.account_sessions%rowtype; v_session_id uuid;
begin
  if p_user_id is null then return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED'); end if;
  if not exists (select 1 from public.account_assignments where account_id = p_account_id and user_id = p_user_id and status = 'active' and (expires_at is null or expires_at > now())) then return jsonb_build_object('success', false, 'code', 'NO_ACTIVE_ASSIGNMENT'); end if;
  if not exists (select 1 from public.user_devices where id = p_device_id and user_id = p_user_id and status = 'active') then return jsonb_build_object('success', false, 'code', 'DEVICE_NOT_AUTHORIZED'); end if;
  perform 1 from public.accounts where id = p_account_id and status = 'available' for update;
  if not found then return jsonb_build_object('success', false, 'code', 'ACCOUNT_UNAVAILABLE'); end if;
  select * into v_session from public.account_sessions where account_id = p_account_id and status in ('starting', 'active', 'stopping') for update;
  if found then
    if v_session.last_heartbeat_at < (now() - interval '90 seconds') and (v_session.reconnect_grace_until is null or v_session.reconnect_grace_until <= now()) then
      update public.account_sessions set status = 'stale', ended_at = now(), release_reason = 'heartbeat_timeout' where id = v_session.id;
    elsif v_session.user_id = p_user_id and v_session.device_id = p_device_id then
      return jsonb_build_object('success', true, 'session_id', v_session.id, 'is_reconnect', true);
    else
      return jsonb_build_object('success', false, 'code', 'ACCOUNT_BUSY');
    end if;
  end if;
  insert into public.account_sessions (account_id, user_id, device_id) values (p_account_id, p_user_id, p_device_id) returning id into v_session_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload) values (p_user_id, 'SESSION_STARTED', 'account_sessions', v_session_id, jsonb_build_object('account_id', p_account_id, 'device_id', p_device_id, 'signed', p_nonce is not null and p_signature is not null));
  return jsonb_build_object('success', true, 'session_id', v_session_id, 'is_reconnect', false);
end;
$$;

create or replace function public.heartbeat_account_session_for_user(p_user_id uuid, p_session_id uuid, p_runtime_state text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  update public.account_sessions set status = 'active', runtime_state = p_runtime_state, last_heartbeat_at = now(), reconnect_grace_until = case when p_runtime_state = 'RECONNECTING' then now() + interval '300 seconds' else null end where id = p_session_id and user_id = p_user_id and status in ('starting', 'active');
  if not found then return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.release_account_lease_for_user(p_actor_id uuid, p_session_id uuid, p_reason text default 'manual', p_is_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_session public.account_sessions%rowtype;
begin
  select * into v_session from public.account_sessions where id = p_session_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); end if;
  if v_session.user_id <> p_actor_id and not p_is_admin then return jsonb_build_object('success', false, 'code', 'FORBIDDEN'); end if;
  update public.account_sessions set status = 'ended', ended_at = now(), release_reason = case when p_is_admin and v_session.user_id <> p_actor_id then 'admin_force_release' else p_reason end where id = p_session_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload) values (p_actor_id, 'SESSION_ENDED', 'account_sessions', p_session_id, jsonb_build_object('release_reason', p_reason));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) from public;
revoke all on function public.heartbeat_account_session_for_user(uuid, uuid, text) from public;
revoke all on function public.release_account_lease_for_user(uuid, uuid, text, boolean) from public;
grant execute on function public.acquire_account_lease_for_user(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.heartbeat_account_session_for_user(uuid, uuid, text) to service_role;
grant execute on function public.release_account_lease_for_user(uuid, uuid, text, boolean) to service_role;

create or replace function public.reap_stale_account_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.account_sessions
  set status = 'stale', ended_at = now(), release_reason = 'heartbeat_timeout'
  where status in ('starting', 'active')
    and last_heartbeat_at < (now() - interval '90 seconds')
    and (reconnect_grace_until is null or reconnect_grace_until <= now());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reap_stale_account_sessions() from public;
grant execute on function public.reap_stale_account_sessions() to service_role;

-- Fail-closed placeholder for the provider-specific device-sealing step. A
-- production deployment must replace this function in a reviewed migration
-- after selecting an encryption envelope compatible with the Tauri device.
create or replace function public.issue_device_launch_payload(p_session_id uuid, p_device_id uuid, p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'device launch payload provider is not configured';
end;
$$;
revoke all on function public.issue_device_launch_payload(uuid, uuid, text) from public;
grant execute on function public.issue_device_launch_payload(uuid, uuid, text) to service_role;

create or replace function public.upsert_account_vault_secret(p_account_id uuid, p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid; v_payload text;
begin
  if length(trim(p_username)) = 0 or length(p_password) = 0 then raise exception 'credential values are required'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then raise exception 'account not found'; end if;
  v_payload := jsonb_build_object('username', p_username, 'password', p_password)::text;
  select vault_secret_id into v_secret_id from public.accounts where id = p_account_id for update;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_payload, 'laap_account_' || p_account_id::text, 'LAAP Riot account credential envelope');
    update public.accounts set vault_secret_id = v_secret_id, updated_at = now() where id = p_account_id;
  else
    perform vault.update_secret(v_secret_id, v_payload, 'laap_account_' || p_account_id::text, 'LAAP Riot account credential envelope');
  end if;
  return v_secret_id;
end;
$$;
revoke all on function public.upsert_account_vault_secret(uuid, text, text) from public;
grant execute on function public.upsert_account_vault_secret(uuid, text, text) to service_role;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'reap-stale-account-sessions') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'reap-stale-account-sessions' limit 1));
  end if;
  perform cron.schedule('reap-stale-account-sessions', '* * * * *', $job$select public.reap_stale_account_sessions();$job$);
exception when undefined_table then
  -- pg_cron is not available in some local Postgres images; the API reaper
  -- remains the development fallback.
  null;
end;
$do$;
