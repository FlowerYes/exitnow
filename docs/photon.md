# Photon cloud gateway

Verified sources: [cloud iMessage](https://photon.codes/docs/spectrum-ts/providers/imessage), [messages](https://photon.codes/docs/spectrum-ts/messages), [connection/routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing).

`providers.ts` uses Spectrum cloud configuration, the message async stream and documented iMessage space lookup/creation. It ignores outbound echoes, non-text input and group spaces. The persistence key is the provider event ID. Phone routing stays in backend trip state and is excluded from job tool responses.

## Access needed

In the Photon dashboard, provide project ID and secret through the server environment and confirm a usable cloud line. Confirm actual entitlement and messaging quota; credits alone are not evidence. Send an inbound DM from a consenting test rider and verify outbound delivery on the device. Recipient updates need independently granted recipient consent plus rider destination permission; the Bot cannot grant either. Consent enrollment uses the separately authenticated operator endpoint below; job tokens cannot grant consent.

## Persistent deployment

Run `tsx apps/gateway/src/server.ts` on a persistent Node service (DigitalOcean App Platform worker/service or a Droplet), with HTTPS termination, MONGODB_URI, SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, GROK_BOT_WEBHOOK_URL, GROK_BOT_WEBHOOK_KEY and GATEWAY_PUBLIC_URL. Set GATEWAY_PORT when needed. Do not deploy the stream into an ephemeral request-only serverless function. Run a single gateway instance until provider stream ownership is coordinated. A MongoDB transaction acquires the state-document write lock before worker callbacks run and does not replay callbacks; the database serializes worker state, but that does not deduplicate provider subscriptions across processes.

The service initializes its MongoDB state document on boot. Use an Atlas cluster or replica set with transaction support. MONGODB_DB defaults to exitnow. Use a restricted database user and managed secret storage. Back up state. Configure database TLS per your MongoDB Atlas connection instructions. Do not expose database ports publicly.

`GATEWAY_MODE=replay` explicitly selects a single-process file-backed replay store and deterministic route completion. It never sends iMessages or invokes Grok Bot. `/health` labels this mode. There is no automatic downgrade from live when a provider fails.

## Retention

Initial state contains identifiable operational routing and inbound text. Before inviting real riders, implement a scheduled 24-hour terminal-job/event cleanup and expose the operator deletion function through a user-authenticated account flow, plus encryption/access audit policy. Do not market this prototype as production privacy compliant. Only independently consented, coarse records belong in `journey_events`; no raw phone or trip histories go on-chain.

## Reproducible HTTP replay

Run `GATEWAY_MODE=replay node --import tsx apps/gateway/src/server.ts`. This binds only localhost. POST `/replay/messages` with JSON `{ "text": "Get me to Williamsburg", "origin": "columbia", "destination": "williamsburg", "departureTime": "2026-09-26T22:00:00Z" }`. Optional eventId exercises deduplication. A 202 returns the durable job ID; poll GET `/replay/state` after the one-second worker tick to inspect the completed route and outbox. Tokens and private contact routing are omitted. These endpoints return 404 in live mode.

Replay data persists at `.data/gateway-replay.json`, override with GATEWAY_REPLAY_FILE. This is single-process persistence, not a substitute for MongoDB concurrency. `node --import tsx --test apps/gateway/test/*.test.ts` tests the HTTP lifecycle and persistence after reopening.

## Trusted consent enrollment and deletion

Set GATEWAY_OPERATOR_SECRET to at least 32 random characters, independently of all Bot tokens. POST `/operator/trips/<URL-encoded-trip-id>/consent` with that bearer secret and JSON `{ "action": "grant", "alias": "maya", "route": "+1...", "destination": "williamsburg", "riderAuthorized": true, "recipientAuthorized": true, "evidenceReference": "signed-consent-record-id" }`. A trusted operator must verify both people's consent before making this assertion. Destination must match the current trip. Evidence reference and grant timestamp are persisted. Bot tools never receive the contact route.

Revoke using `{ "action": "revoke", "alias": "maya" }`. DELETE `/operator/trips/<URL-encoded-trip-id>` with the same independent operator authorization removes private trip state, jobs and queued notifications. Provider event-ID tombstones remain for deduplication; these contain no message/contact payload. This is an operator control, not yet a public user-authenticated account deletion UI.

New inbound events immediately supersede older pending/running jobs. Stop-sharing variants conservatively revoke every recipient. Queued instructions carry a trip version and are suppressed when stale. Arrival notifications require confirmed arrival, cooldown and no prior arrival notification for that destination. Photon ingestion blocks and retries the same event during persistence outages with a capped 30-second retry interval, rather than dropping revocations.

## Current local connection

Project authentication, active Pro subscription, shared-pool allocation, and Spectrum initialization were verified. HTTPS health probe succeeded via the explicitly approved temporary ngrok tunnel. `.env` contains its URL. This is a local live transport, not cloud deployment; keep the gateway and tunnel processes running and the Mac awake. Routes remain synthetic replay. Actual iMessage delivery requires the authorized test recipient and a reply. Request inspection on ngrok is disabled.


## Rider Rewards identity and reporting

The existing Spectrum stream and Grok webhook remain the transport. Reward identity is derived on the server as `photon:<authenticated sender ID>` from the authorized job's stored trip owner. Tool JSON cannot supply an account or contributor group. Known first-party account links can be configured through the trusted `REWARDS_ACCOUNT_LINKS_JSON` mapping; changing a wallet does not change the contributor group. This bounds known linkage, but does not establish that every different phone number is an independent person.

Reporting and navigation need no wallet. Prepare/submit tools reserve deterministic provisional rewards and accept explicitly confirmed unpaid reports; only official evidence or a separately authenticated moderator can release credit. Fresh verified observations attach contextual guidance to relevant trips and rider-only updates through the existing durable outbox. Contact routes, phone numbers, full trips and evidence stay off-chain.

Set `REWARDS_SESSION_SECRET` (at least 32 random characters) to enable private 15-minute access tokens from `get_reward_status`. The rider pastes their token into Rider Rewards; it must not be appended to a URL. Use the same server secret and MongoDB database for the web and gateway processes. Configure the campaign and payout settings described in Rider Rewards documentation. Missing rewards configuration never grants the Bot verification or payment capabilities.

## One-time web ETA notifications

The trip planner's Notify friends panel now sends through `POST /api/eta`. The server uses the documented Spectrum cloud SDK (`im.user(phone)` → `im.space.create(user)` → `dm.send(text)`) with server-only SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET. A returned message ID means provider acceptance, not confirmed delivery. Errors/timeouts explicitly retain delivery uncertainty and are not automatically retried.

Enter an international +country-code number, confirm the friend's agreement, and click Send ETA with Photon. Hosted production requires a private rider access code from the existing Photon rider flow. Only the loopback development preview bypasses rider authentication. This is a one-time update, not continuous tracking. Synthetic trips remain labeled in the message.

The Node process caches one SDK client. Limits are process-local: 20 attempts/hour globally, five/account/hour, recipient cooldown of one minute, and duplicate message suppression for one hour. Run one long-lived web instance for this prototype; move limits and deduplication into shared durable storage before multi-instance deployment. No phone or secret is logged by the endpoint. Provider acceptance was tested with a browser mock; real recipient delivery requires a consenting test phone and has not been claimed.

API documentation rechecked through Exa: https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing .
