-- Session Token Sandboxing Migration
-- Allows storing and securely issuing encrypted Riot Client session YAML blobs
-- to active lease holders for 1-click launch without password exposure.

alter table public.accounts
  add column if not exists session_blob text;

-- Function for Admins / Service Role to save captured session blobs
create or replace function public.save_account_session_blob(
  p_account_id uuid,
  p_session_blob text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_is_admin boolean := public.is_admin();
  v_user_id uuid := auth.uid();
begin
  if not v_is_admin and v_user_id is not null then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  if not exists (select 1 from public.accounts where id = p_account_id) then
    return jsonb_build_object('success', false, 'code', 'ACCOUNT_NOT_FOUND');
  end if;

  update public.accounts
  set session_blob = p_session_blob,
      updated_at = now()
  where id = p_account_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (v_user_id, 'SESSION_BLOB_PROVISIONED', 'accounts', p_account_id, jsonb_build_object('account_id', p_account_id));

  return jsonb_build_object('success', true);
end;
$$;

-- Function to securely fetch session blob for an active lease holder
create or replace function public.get_account_session_blob_for_user(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_session public.account_sessions%rowtype;
  v_session_blob text;
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  end if;

  select * into v_session
  from public.account_sessions
  where id = p_session_id and user_id = p_user_id and status in ('starting', 'active');

  if not found then
    return jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  select session_blob into v_session_blob
  from public.accounts
  where id = v_session.account_id;

  if v_session_blob is null then
    return jsonb_build_object('success', false, 'code', 'SESSION_BLOB_NOT_PROVISIONED');
  end if;

  return jsonb_build_object('success', true, 'session_blob', v_session_blob);
end;
$$;

-- Function to clear session blob for an account
create or replace function public.delete_account_session_blob(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_is_admin boolean := public.is_admin();
  v_user_id uuid := auth.uid();
begin
  if not v_is_admin and v_user_id is not null then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  update public.accounts
  set session_blob = null,
      updated_at = now()
  where id = p_account_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (v_user_id, 'SESSION_BLOB_REVOKED', 'accounts', p_account_id, jsonb_build_object('account_id', p_account_id));

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.save_account_session_blob(uuid, text) from public;
revoke all on function public.get_account_session_blob_for_user(uuid, uuid) from public;
revoke all on function public.delete_account_session_blob(uuid) from public;

grant execute on function public.save_account_session_blob(uuid, text) to authenticated, service_role;
grant execute on function public.get_account_session_blob_for_user(uuid, uuid) to authenticated, service_role;
grant execute on function public.delete_account_session_blob(uuid) to authenticated, service_role;
