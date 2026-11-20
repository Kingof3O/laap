# Production operations

## Workers

| Wrangler configuration | Entry point | Purpose |
| --- | --- | --- |
| `wrangler.toml` | `apps/api/src/riot-worker.ts` | League live-match proxy, health, and readiness |
| `wrangler.billing.toml` | `apps/api/src/billing-worker.ts` | Checkout, activation, restore, gifts, device transfer, and billing reconciliation |

Configure `RIOT_API_KEY` and `LAAP_RIOT_PROXY_TOKEN` as Worker secrets. When the desktop uses a managed live-match Worker, its release build receives `LAAP_LIVE_WORKER_URL` and `LAAP_LIVE_WORKER_TOKEN`. The service authorizes live-match requests and applies rate limits. See [billing setup](../billing/README.md) for the billing database, Paddle configuration, and launch checks.

## Desktop releases

Both tiers install as `LAAP Offline` and receive updates through `latest-offline.json`. Keep the existing application identifier and update public key when packaging upgrades.

The [release workflow](../.github/workflows/release-desktop.yml) checks the tagged app version, successful CI, draft release state, and the recorded billing acceptance SHA. It generates and verifies the Offline manifest against signed Windows and macOS update artifacts. The [SignPath workflow](../.github/workflows/signpath-windows.yml) handles Windows signing when configured. See the [code-signing policy](../CODE_SIGNING.md).
