-- Apply only to the dedicated LAAP billing Supabase project.
begin;
create schema if not exists laap_billing;
revoke all on schema laap_billing from public, anon, authenticated;

create table if not exists laap_billing.checkout (
  id uuid primary key default gen_random_uuid(),
  buyer uuid not null,
  plan text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  transaction_id text unique,
  url text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists one_open_checkout
  on laap_billing.checkout(buyer) where closed_at is null;

create table if not exists laap_billing.payments (
  transaction_id text primary key,
  buyer uuid not null,
  customer_id text not null,
  subscription_id text,
  plan text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  check ((plan = 'lifetime') = (ends_at is null)),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists billing_payment_buyer on laap_billing.payments(buyer);
create index if not exists billing_payment_subscription on laap_billing.payments(subscription_id);

create table if not exists laap_billing.events (
  id text primary key,
  received_at timestamptz not null default now()
);
create table if not exists laap_billing.pending_payments (
  transaction_id text primary key,
  next_attempt timestamptz not null default now(),
  attempts integer not null default 0
);
create index if not exists billing_pending_due on laap_billing.pending_payments(next_attempt);
create table if not exists laap_billing.event_cursor (
  singleton boolean primary key default true check (singleton),
  event_id text not null
);
create table if not exists laap_billing.adjustments (
  id text primary key,
  transaction_id text not null,
  occurred_at timestamptz not null,
  action text not null,
  status text not null,
  full_refund boolean not null
);
create index if not exists billing_adjustment_transaction on laap_billing.adjustments(transaction_id);

create table if not exists laap_billing.gifts (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  duration text not null check (duration in ('month', 'year', 'lifetime')),
  recipient text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  redeem_by timestamptz not null default (now() + interval '30 days'),
  buyer uuid,
  redeemed_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz
);
create index if not exists billing_gift_buyer on laap_billing.gifts(buyer);

create table if not exists laap_billing.activations (
  buyer uuid primary key,
  device_key text unique not null,
  transferred_at timestamptz
);
create table if not exists laap_billing.transfer_overrides (
  buyer uuid primary key,
  actor uuid not null,
  reason text not null,
  expires_at timestamptz not null default (now() + interval '2 days')
);
create table if not exists laap_billing.challenges (
  challenge_hash text primary key,
  device_key text not null,
  action text not null,
  expires_at timestamptz not null default (now() + interval '2 minutes')
);
create table if not exists laap_billing.throttles (
  subject text primary key,
  starts_at timestamptz not null,
  hits integer not null
);
create table if not exists laap_billing.audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  target text not null,
  reason text,
  recorded_at timestamptz not null default now()
);

create or replace function laap_billing.lock_buyer(buyer uuid) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(buyer::text, 4713));
$$;

create or replace function laap_billing.active_grant(who uuid)
returns table(grant_id text, expiry timestamptz)
language sql stable set search_path = '' as $$
  select grant_id, expiry from (
    select 'p:' || p.transaction_id as grant_id, p.ends_at as expiry
    from laap_billing.payments p
    where p.buyer = who and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
      and not exists (
        select 1 from laap_billing.adjustments a where a.transaction_id = p.transaction_id
          and a.action = 'refund' and a.status = 'approved' and a.full_refund
      )
      and not exists (
        select 1 from laap_billing.adjustments a where a.transaction_id = p.transaction_id
          and a.action = 'chargeback' and a.status = 'approved'
          and not exists (
            select 1 from laap_billing.adjustments r where r.transaction_id = a.transaction_id
              and r.action = 'chargeback_reverse' and r.status = 'approved' and r.occurred_at > a.occurred_at
          )
      )
    union all
    select 'g:' || g.id::text, g.ends_at from laap_billing.gifts g
    where g.buyer = who and g.revoked_at is null and (g.ends_at is null or g.ends_at > now())
  ) grants order by expiry desc nulls first, grant_id limit 1;
$$;

create or replace function laap_billing.grant_json(who uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('grantId', g.grant_id, 'end', floor(extract(epoch from g.expiry))::bigint)
     from laap_billing.active_grant(who) g),
    '{}'::jsonb
  );
$$;

create or replace function public.laap_billing_throttle(p_key text, p_limit integer, p_seconds integer)
returns boolean language sql set search_path = '' as $$
  insert into laap_billing.throttles as t(subject, starts_at, hits)
  values (p_key, now(), 1)
  on conflict (subject) do update set
    hits = case when t.starts_at <= now() - make_interval(secs => p_seconds) then 1 else least(t.hits + 1, p_limit + 1) end,
    starts_at = case when t.starts_at <= now() - make_interval(secs => p_seconds) then now() else t.starts_at end
  returning hits <= p_limit;
$$;

create or replace function public.laap_billing_prepare_checkout(p_buyer uuid, p_plan text)
returns jsonb language plpgsql set search_path = '' as $$
declare pending laap_billing.checkout%rowtype;
begin
  perform laap_billing.lock_buyer(p_buyer);
  if exists (select 1 from laap_billing.active_grant(p_buyer)) then
    return '{"error":"This account already has Pro."}';
  end if;
  select * into pending from laap_billing.checkout where buyer = p_buyer and closed_at is null for update;
  if found then
    if pending.transaction_id is not null then
      return jsonb_build_object('id', pending.id, 'url', pending.url, 'transactionId', pending.transaction_id, 'plan', pending.plan);
    end if;
    if pending.created_at > now() - interval '2 minutes' then
      return '{"error":"Checkout is still being prepared. Please try again shortly."}';
    end if;
    update laap_billing.checkout set closed_at = now() where id = pending.id;
  end if;
  insert into laap_billing.checkout(buyer, plan) values(p_buyer, p_plan) returning * into pending;
  return jsonb_build_object('id', pending.id);
end;
$$;

create or replace function public.laap_billing_finish_checkout(
  p_id uuid, p_transaction text, p_url text, p_close boolean
) returns boolean language sql set search_path = '' as $$
  with updated as (
    update laap_billing.checkout
    set transaction_id = coalesce(p_transaction, transaction_id), url = coalesce(p_url, url),
        closed_at = case when p_close then now() else null end
    where id = p_id and closed_at is null and (p_close or transaction_id is null)
    returning 1
  ) select exists(select from updated);
$$;

create or replace function public.laap_billing_pending_checkout(p_buyer uuid)
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('id', id, 'transactionId', transaction_id)
  from laap_billing.checkout where buyer = p_buyer and closed_at is null;
$$;

create or replace function public.laap_billing_payment(
  p_event text, p_transaction text, p_customer text, p_subscription text,
  p_plan text, p_starts timestamptz, p_ends timestamptz
) returns boolean language plpgsql set search_path = '' as $$
declare purchaser uuid;
begin
  if exists(select 1 from laap_billing.events where id = p_event) then return true; end if;
  select buyer into purchaser from laap_billing.checkout
    where transaction_id = p_transaction and plan = p_plan;
  if purchaser is null and p_subscription is not null and not exists (
    select 1 from laap_billing.checkout where transaction_id = p_transaction
  ) then
    select buyer into purchaser from laap_billing.payments
      where subscription_id = p_subscription and customer_id = p_customer limit 1;
  end if;
  -- An initial payment that arrives after its renewal is retried by Paddle.
  if purchaser is null then return false; end if;
  perform laap_billing.lock_buyer(purchaser);
  insert into laap_billing.events(id) values(p_event) on conflict do nothing;
  if not found then return true; end if;
  insert into laap_billing.payments values(p_transaction, purchaser, p_customer, p_subscription, p_plan, p_starts, p_ends)
    on conflict (transaction_id) do nothing;
  update laap_billing.checkout set closed_at = coalesce(closed_at, now()) where transaction_id = p_transaction;
  delete from laap_billing.pending_payments where transaction_id = p_transaction;
  return true;
end;
$$;

create or replace function public.laap_billing_queue_payment(p_transaction text)
returns void language sql set search_path = '' as $$
  insert into laap_billing.pending_payments(transaction_id)
  select p_transaction where not exists (
    select 1 from laap_billing.payments where transaction_id = p_transaction
  ) on conflict do nothing;
$$;

create or replace function public.laap_billing_claim_payments()
returns jsonb language sql set search_path = '' as $$
  with due as (
    select transaction_id from laap_billing.pending_payments
    where next_attempt <= now() order by next_attempt, transaction_id limit 8 for update skip locked
  ), claimed as (
    update laap_billing.pending_payments p set
      attempts = p.attempts + 1,
      next_attempt = now() + make_interval(mins => least(60, (p.attempts + 1) * 5))
    from due where p.transaction_id = due.transaction_id returning p.transaction_id
  )
  select coalesce(jsonb_agg(transaction_id), '[]'::jsonb) from claimed;
$$;

create or replace function public.laap_billing_no_charge(p_transaction text, p_close_checkout boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_close_checkout then
    update laap_billing.checkout set closed_at = now()
      where transaction_id = p_transaction and closed_at is null;
  end if;
  delete from laap_billing.pending_payments where transaction_id = p_transaction;
end;
$$;

create or replace function public.laap_billing_event_cursor(p_event text default null)
returns text language plpgsql set search_path = '' as $$
begin
  if p_event is not null then
    insert into laap_billing.event_cursor as c(event_id) values(p_event)
    on conflict (singleton) do update set event_id = greatest(c.event_id collate "C", excluded.event_id collate "C");
  end if;
  return (select event_id from laap_billing.event_cursor);
end;
$$;

create or replace function public.laap_billing_adjustment(
  p_event text, p_id text, p_transaction text, p_occurred timestamptz, p_action text, p_status text, p_full boolean
) returns boolean language plpgsql set search_path = '' as $$
begin
  insert into laap_billing.events(id) values(p_event) on conflict do nothing;
  if not found then
    -- A replay can confirm the full amount of this same approved refund.
    update laap_billing.adjustments set full_refund = true
      where p_full and p_action = 'refund' and p_status = 'approved'
        and id = p_id and transaction_id = p_transaction and occurred_at = p_occurred
        and action = p_action and status = p_status and not full_refund;
    return true;
  end if;
  insert into laap_billing.adjustments as a values(p_id, p_transaction, p_occurred, p_action, p_status, p_full)
    on conflict (id) do update set occurred_at = excluded.occurred_at, status = excluded.status,
      full_refund = excluded.full_refund
    where excluded.occurred_at > a.occurred_at;
  return true;
end;
$$;

create or replace function public.laap_billing_customer(p_buyer uuid)
returns text language sql set search_path = '' as $$
  select customer_id from laap_billing.payments where buyer = p_buyer order by starts_at desc limit 1;
$$;

create or replace function public.laap_billing_challenge(p_hash text, p_device text, p_action text)
returns void language sql set search_path = '' as $$
  insert into laap_billing.challenges(challenge_hash, device_key, action) values(p_hash, p_device, p_action);
$$;

create or replace function public.laap_billing_use_challenge(p_hash text, p_device text, p_action text)
returns boolean language sql set search_path = '' as $$
  with used as (
    delete from laap_billing.challenges
    where challenge_hash = p_hash and device_key = p_device and action = p_action and expires_at > now()
    returning 1
  ) select exists(select from used);
$$;

create or replace function public.laap_billing_activate(p_buyer uuid, p_device text, p_transfer boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare old laap_billing.activations%rowtype;
declare override laap_billing.transfer_overrides%rowtype;
declare grant_state jsonb;
begin
  perform laap_billing.lock_buyer(p_buyer);
  grant_state := laap_billing.grant_json(p_buyer);
  if grant_state = '{}' then return grant_state; end if;
  select * into old from laap_billing.activations where buyer = p_buyer for update;
  if found and old.device_key = p_device then return grant_state; end if;
  if old.device_key is not null then
    if not p_transfer then return '{"error":"Pro is already active on another computer. Transfer the activation to continue."}'; end if;
    delete from laap_billing.transfer_overrides where buyer = p_buyer and expires_at > now()
      returning * into override;
    if old.transferred_at > now() - interval '30 days' and override.actor is null then
      return '{"error":"A device transfer has already been used in the last 30 days. Contact support."}';
    end if;
  end if;
  insert into laap_billing.activations as a(buyer, device_key, transferred_at)
    values(p_buyer, p_device, case when old.device_key is not null then now() else null end)
    on conflict (buyer) do update set device_key = excluded.device_key, transferred_at = excluded.transferred_at;
  if old.device_key is not null then
    insert into laap_billing.audit(actor, action, target, reason)
      values(coalesce(override.actor, p_buyer), 'device_transfer', p_buyer::text, override.reason);
  end if;
  return grant_state;
exception when unique_violation then
  return '{"error":"This computer is already linked to a different LAAP billing account. Contact support."}';
end;
$$;

create or replace function public.laap_billing_refresh(p_device text) returns jsonb
language sql set search_path = '' as $$
  select coalesce((select laap_billing.grant_json(buyer) from laap_billing.activations where device_key = p_device), '{}'::jsonb);
$$;

create or replace function public.laap_billing_create_gift(p_owner uuid, p_hash text, p_duration text, p_email text)
returns jsonb language plpgsql set search_path = '' as $$
declare gift laap_billing.gifts%rowtype;
begin
  insert into laap_billing.gifts(code_hash, duration, recipient, created_by)
    values(p_hash, p_duration, p_email, p_owner) returning * into gift;
  insert into laap_billing.audit(actor, action, target) values(p_owner, 'gift_created', gift.id::text);
  return jsonb_build_object('id', gift.id, 'redeemBy', gift.redeem_by);
end;
$$;

create or replace function public.laap_billing_redeem(p_buyer uuid, p_email text, p_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare gift laap_billing.gifts%rowtype;
begin
  perform laap_billing.lock_buyer(p_buyer);
  select * into gift from laap_billing.gifts where code_hash = p_hash for update;
  if not found or gift.revoked_at is not null or (gift.recipient is not null and gift.recipient <> p_email) then
    return '{"error":"This gift code is invalid or unavailable."}';
  end if;
  -- Retrying the same redemption after losing the response is safe.
  if gift.buyer = p_buyer then
    return laap_billing.grant_json(p_buyer);
  end if;
  if gift.buyer is not null or gift.redeem_by <= now() then
    return '{"error":"This gift code is invalid or unavailable."}';
  end if;
  if exists(select 1 from laap_billing.active_grant(p_buyer)) then
    return '{"error":"You already have Pro. Your gift code has not been used."}';
  end if;
  if exists(select 1 from laap_billing.checkout where buyer = p_buyer and closed_at is null) then
    return '{"error":"Close your pending checkout before redeeming a gift."}';
  end if;
  update laap_billing.gifts set buyer = p_buyer, redeemed_at = now(),
    ends_at = case gift.duration when 'month' then now() + interval '30 days' when 'year' then now() + interval '1 year' end
    where id = gift.id;
  return laap_billing.grant_json(p_buyer);
end;
$$;

create or replace function public.laap_billing_gifts(p_owner uuid) returns jsonb
language sql set search_path = '' as $$
  select coalesce(jsonb_agg(row_data), '[]'::jsonb) from (
    select id, duration, recipient, redeem_by, redeemed_at, ends_at, revoked_at
    from laap_billing.gifts where created_by = p_owner order by created_at desc limit 100
  ) row_data;
$$;

create or replace function public.laap_billing_revoke_gift(p_owner uuid, p_id uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  update laap_billing.gifts set revoked_at = now() where id = p_id and created_by = p_owner and revoked_at is null;
  if not found then return false; end if;
  insert into laap_billing.audit(actor, action, target) values(p_owner, 'gift_revoked', p_id::text);
  return true;
end;
$$;

create or replace function public.laap_billing_transfer_override(p_email text, p_owner uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  select id into recipient from auth.users where lower(email) = p_email and email_confirmed_at is not null limit 1;
  if recipient is null then return false; end if;
  perform laap_billing.lock_buyer(recipient);
  insert into laap_billing.transfer_overrides(buyer, actor, reason) values(recipient, p_owner, p_reason)
    on conflict (buyer) do update set actor = excluded.actor, reason = excluded.reason, expires_at = excluded.expires_at;
  insert into laap_billing.audit(actor, action, target, reason)
    values(p_owner, 'transfer_override_issued', recipient::text, p_reason);
  return true;
end;
$$;

create or replace function public.laap_billing_cleanup() returns void
language plpgsql set search_path = '' as $$
begin
  delete from laap_billing.challenges where expires_at < now();
  delete from laap_billing.throttles where starts_at < now() - interval '2 days';
  delete from laap_billing.transfer_overrides where expires_at < now();
  delete from laap_billing.pending_payments p where exists (
    select 1 from laap_billing.payments where transaction_id = p.transaction_id
  );
end;
$$;

do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and left(p.proname, 13) = 'laap_billing_'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;
grant usage on schema laap_billing to service_role;
grant select, insert, update, delete on all tables in schema laap_billing to service_role;
grant usage, select on all sequences in schema laap_billing to service_role;
commit;
