# LAAP billing setup

LAAP Basic and Pro use the same desktop app, local vault, and Offline updater. Billing runs separately from the Riot Worker. Configure and test the sandbox before enabling checkout for real customers.

## Sandbox

1. Create a dedicated Supabase billing project. Apply [supabase.sql](supabase.sql) as the project database owner. Configure Auth email OTP templates to include the token and set up custom SMTP. Keep Auth, database, and mail credentials in the billing environment. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)
2. Create a Paddle sandbox product with three USD prices. Use **$3 monthly**, **$20 yearly**, and **$60 one-time**, with no trials or zero-cost discounts. Enable PayPal in checkout settings. Set the default payment page to the HTTPS Worker origin followed by /checkout. Set the notification URL to that same origin followed by /v1/webhook/paddle. Subscribe to transaction.completed, adjustment.created, and adjustment.updated. [Paddle default payment link](https://developer.paddle.com/build/transactions/default-payment-link/) · [PayPal sandbox checkout](https://developer.paddle.com/concepts/payment-methods/paypal/)
3. Deploy the separate Worker using the [billing Wrangler configuration](../wrangler.billing.toml). Set BILLING_ORIGIN, SUPABASE_URL, SUPABASE_ANON_KEY, PADDLE_CLIENT_TOKEN, and PADDLE_MONTHLY_PRICE, PADDLE_YEARLY_PRICE, and PADDLE_LIFETIME_PRICE. Set SUPABASE_SERVICE_ROLE_KEY, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, and BILLING_SIGNING_KEY with Wrangler secrets. Checkout requires distinct test or live credentials per environment. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. Generate a dedicated Ed25519 key pair and keep the private key outside the workspace. BILLING_SIGNING_KEY is the unpadded base64url PKCS#8 DER private key. LAAP_BILLING_PUBLIC_KEY is the unpadded base64url raw 32-byte public key, available as the x field of the exported Ed25519 public JWK. Build the desktop app with LAAP_BILLING_ORIGIN set to the HTTPS Worker origin and LAAP_BILLING_PUBLIC_KEY set to that public key. These two values are the only billing configuration embedded in the app.
5. Verify the owner email with the billing Auth project. Set BILLING_OWNER_USER_ID to that verified user’s Supabase UUID. Open /gifts on the Worker to issue or revoke codes or authorize a device transfer override. An override expires after two days and still requires the purchaser’s fresh email code and device proof.

## Verification

- Run the API tests, Basic Rust tests, and desktop UI tests. Apply [verify.sql](verify.sql) to a disposable billing database after applying the schema. It uses a transaction and rolls back its changes.
- Buy each price using a Paddle sandbox buyer. Test PayPal with a separate PayPal sandbox buyer account. Confirm the subscription’s first payment and renewal map to the purchaser, the payment webhook is received, and **Activate Pro** unlocks the app. Exercise cancellation, declined renewal, and refund, then redeem a single-use gift from two clients and check that only one succeeds.
- On Windows and macOS, install the signed v1.0.1 release into a disposable OS account and populate a test vault. Upgrade through the existing signed Offline updater. Confirm the installer identity and keychain access are preserved, choose two profiles, and verify that Pro restores the original vault. Confirm the signed bundle contains only the Basic/Pro application, including under the SignPath workflow.

## Production

Use a separate Worker environment, database, signing key, and Paddle live credentials. Keep BILLING_LIVE_ENABLED false until Paddle seller and site approval and Riot approval for the entitlement model are recorded. Set the production Worker’s published HTTPS origin and public key as the LAAP_BILLING_ORIGIN and LAAP_BILLING_PUBLIC_KEY GitHub Actions variables before preparing a release. If using SignPath, update its two remote artifact configurations from the repository XML files to match the Offline-only paths before requesting signatures. Keep the existing updater public key and feed.

Monitor Paddle notification retries and Worker errors, particularly checkout attribution, gift redemption failures, and license refresh failures. During billing outages, Basic remains available and Pro can use its cached lease through its signed deadline.
