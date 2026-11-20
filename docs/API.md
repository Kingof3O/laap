# Worker APIs

The LAAP desktop calls two independent Workers. See [production operations](PRODUCTION.md) for their configuration.

- Riot live status exposes `GET /api/health`, `GET /api/ready`, and authenticated `POST /api/riot/live-status`. The [Riot Worker](../apps/api/src/riot-worker.ts) defines the request contract and authorization checks.
- Billing supports email verification, checkout, activation and restore, gift redemption, device transfer, and Paddle event handling. The [billing Worker](../apps/api/src/billing-worker.ts) defines the routes. See [billing setup](../billing/README.md) for test and production configuration.
