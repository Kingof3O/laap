-- Run against a disposable billing database as its setup role.
begin;
set local role service_role;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  pending jsonb;
  result jsonb;
  gift jsonb;
begin
  pending := public.laap_billing_prepare_checkout(a, 'monthly');
  assert public.laap_billing_finish_checkout((pending->>'id')::uuid, 'txn_test', 'https://example.test/checkout', false);
  assert not public.laap_billing_payment('evt_renewal', 'txn_renewal', 'ctm_test', 'sub_test',
    'monthly', now() - interval '1 day', now() + interval '60 days');

  assert public.laap_billing_payment('evt_initial', 'txn_test', 'ctm_test', 'sub_test',
    'monthly', now() - interval '1 day', now() + interval '30 days');
  assert public.laap_billing_payment('evt_initial', 'txn_test', 'ctm_test', 'sub_test',
    'monthly', now() - interval '1 day', now() + interval '99 days');
  assert public.laap_billing_activate(a, 'device-a', false)->>'grantId' = 'p:txn_test';
  assert public.laap_billing_activate(a, 'device-b', false) ? 'error';
  assert public.laap_billing_activate(a, 'device-b', true)->>'grantId' = 'p:txn_test';
  assert public.laap_billing_activate(a, 'device-a', true) ? 'error';
  assert public.laap_billing_refresh('device-a') = '{}'::jsonb;
  assert public.laap_billing_refresh('device-b')->>'end' = floor(extract(epoch from now() + interval '30 days'))::bigint::text;

  assert public.laap_billing_adjustment('evt_refund', 'adj_refund', 'txn_renewal', now(), 'refund', 'approved', true);
  assert public.laap_billing_adjustment('evt_old_refund', 'adj_refund', 'txn_renewal',
    now() - interval '1 second', 'refund', 'pending_approval', true);
  assert public.laap_billing_payment('evt_renewal', 'txn_renewal', 'ctm_test', 'sub_test',
    'monthly', now() - interval '1 day', now() + interval '60 days');
  assert public.laap_billing_refresh('device-b')->>'grantId' = 'p:txn_test';
  assert public.laap_billing_adjustment('evt_chargeback', 'adj_disputed', 'txn_test', now(), 'chargeback', 'approved', true);
  assert public.laap_billing_refresh('device-b') = '{}'::jsonb;
  assert public.laap_billing_adjustment('evt_reversed', 'adj_reversed', 'txn_test',
    now() + interval '1 second', 'chargeback_reverse', 'approved', true);
  assert public.laap_billing_refresh('device-b')->>'grantId' = 'p:txn_test';

  gift := public.laap_billing_create_gift(owner_id, 'hashed-code-for-verified-b', 'month', 'b@example.test');
  assert public.laap_billing_redeem(a, 'a@example.test', 'hashed-code-for-verified-b') ? 'error';
  result := public.laap_billing_redeem(b, 'b@example.test', 'hashed-code-for-verified-b');
  assert result->>'grantId' = 'g:' || (gift->>'id');
  assert result->>'end' = floor(extract(epoch from now() + interval '30 days'))::bigint::text;
  assert public.laap_billing_redeem(b, 'b@example.test', 'hashed-code-for-verified-b') = result;
  assert public.laap_billing_redeem(a, 'b@example.test', 'hashed-code-for-verified-b') ? 'error';
  assert not public.laap_billing_revoke_gift(a, (gift->>'id')::uuid);
  assert public.laap_billing_revoke_gift(owner_id, (gift->>'id')::uuid);
  assert public.laap_billing_activate(b, 'device-c', false) = '{}'::jsonb;
  perform public.laap_billing_create_gift(owner_id, 'spare-gift-while-paid', 'lifetime', null);
  assert public.laap_billing_redeem(a, 'a@example.test', 'spare-gift-while-paid') ? 'error';
  assert public.laap_billing_redeem(b, 'b@example.test', 'spare-gift-while-paid')->>'grantId' is not null;

  perform public.laap_billing_challenge('challenge-hash', 'device-b', 'refresh');
  assert not public.laap_billing_use_challenge('challenge-hash', 'device-b', 'transfer');
  assert public.laap_billing_use_challenge('challenge-hash', 'device-b', 'refresh');
  assert not public.laap_billing_use_challenge('challenge-hash', 'device-b', 'refresh');
  assert not has_function_privilege('authenticated', 'public.laap_billing_create_gift(uuid,text,text,text)', 'execute');
end;
$$;
rollback;
