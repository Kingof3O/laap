-- LAAP no longer accepts or hands off Riot passwords. Existing Vault rows are
-- intentionally preserved for an explicit, audited cleanup; no application
-- role may write or read them through the old RPC.
revoke all on function public.upsert_account_vault_secret(uuid, text, text) from public;
revoke all on function public.upsert_account_vault_secret(uuid, text, text) from service_role;

-- Keep this function as a fail-closed compatibility boundary until an approved
-- RSO/native-client design replaces it with a non-secret launch state flow.
revoke all on function public.issue_device_launch_payload(uuid, uuid, text) from public;
revoke all on function public.issue_device_launch_payload(uuid, uuid, text) from service_role;
