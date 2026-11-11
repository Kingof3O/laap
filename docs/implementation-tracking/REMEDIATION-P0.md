# Local remediation checkpoint

Baseline: 93ed1fbce023e2b2493ed565d6d306c8fff8c2f7. No publishing, release, installer, live game action, or production data changes.

Implemented: marketplace fail-closed explicitly injected admin key; timing-safe comparison; creator ownership; actual bounded ZIP bytes + manifest + entry hashing; transactional SQLite storage; human approval; persisted review/takedown/restore audit; creator quotas; HTTP request/concurrency limits; authenticated unique editable/deletable reviews; public approved-only downloads; keychain-scoped desktop identity registration/recovery/disconnect and pending-status UI. Legacy hash-only submissions cannot be approved or downloaded without resubmission. Independent reports/blocklist is honored by marketplace downloads.

Native import computes real archive/entry digests from declared licensed original assets. Original Fantome/Modpkg bytes and format are preserved. Indexed package export repaired. Frontend/native mod-list, conflict, argument and activity contracts corrected. Staging only accepts app-owned sandbox; atomic generation pointer; owned-file digest preflight on rollback; unrelated files preserved; symlink/reparse-point checks. No game installation writes or activation claim.

Relay transfer requires requested announced hash, sender approval and redistributable manifest. Server-generated transfer IDs, bounded chunks/aggregate bytes/concurrency, duplicate handling, final archive validation and cancellation. Receiver passes original manifest and archive through native importer; progress reaches 100 only after import. Interrupted transfers cancel and require a fresh request after room reconnect. This is relay transfer, not direct P2P or byte-resume.

Discord presence-only IPC replaces insecure unfinished OAuth. Numeric app ID; no desktop client-secret exchange or token persistence; legacy JSON tokens scrubbed on configuration load; READY and matching SET_ACTIVITY acknowledgement required with deadlines. Windows named pipes and Unix sockets are implemented. Live Discord visibility has NOT been verified.

Executed: community TypeScript check PASS; community HTTP/WebSocket suite 8 PASS (real local transports, generated original ZIP fixtures); desktop production frontend build PASS; native customization suite 32 PASS / 2 ignored (external Data Dragon and generated pack). Native file tests cover nested Fantome/Modpkg import/export/reimport, sandbox stage/rollback and corrupted next generation preserving old stage. These do not prove installed-app UI, real Discord, live game compatibility, hosted deployment or native keychain persistence.

Remaining: browser integration and all edition regression checks, evidence generator replacement, provider contracts, theme runtime contracts, Complete context, full creator/catalog parity, cancellation/recovery hardening and native end-to-end journeys. NO-GO for claiming complete product readiness.
