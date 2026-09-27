# Messaging reliability

The gateway persists inbound events and uses their provider IDs for deduplication. Newer input invalidates older jobs and queued replies. Consent and trip version are checked again when sending. These protections remain in place.

Failed dispatches and five-minute routine timeouts now queue a rider-facing failure notice with a concrete recovery action: send a new message with the current station and destination. Notices are scoped to the current trip version and keyed by job ID, so repeated worker ticks or restarts cannot create duplicate notices. Superseded jobs do not send failure notices.

The gateway prefixes completed responses associated with a replay route with an explicit synthetic warning, even if the bot omits it. This preserves the full response and does not manufacture live ETAs. Messaging still uses the synthetic route dataset; the web planner's live transit connection is separate.

An ambiguous transport failure is never retried automatically. Outbound records are durably marked `sending` before dispatch; failed sends become `uncertain`. A process failure can leave `sending` records. Both require provider-history/operator reconciliation before any resend. This also applies to failure notices. A successful routine webhook response means acceptance, not a completed answer or device delivery.

Regression verification: `node --import tsx --test apps/gateway/test/reliability.test.ts`. It covers dispatch failure, timeout, stale failure suppression, uncertain delivery, crash markers, replay provenance, blank results, and full-length responses. The tests use in-memory transport doubles and send no external messages.

Remaining integration gates: attach an authoritative live routing adapter to the gateway, verify the deployed routine actually calls the tools and completes a job, verify Photon device delivery with an explicitly authorized rider, and provide an operational reconciliation workflow for uncertain sends. This change does not establish a live end-to-end journey, automatically retry provider operations, or make delivery exactly once.

## Rewards access recovery

The exact commands `my rewards` and `rewards` are handled directly by the gateway worker. They return a private 15-minute access code without calling the Grok routine or initializing rewards storage. Identity still comes from the authenticated Photon sender, and delivery still uses the durable, version-checked outbox. This requires the live worker and Photon stream to be running.

The web app loads the repository-root `.env` as shared server configuration; existing process and app-specific environment values take precedence. Restart a production preview after rebuilding. A healthy Photon subscription does not establish that the gateway is running: check both the local `/health` endpoint and the configured public HTTPS URL. The rewards page displays a messaging-unavailable notice when public live health cannot be confirmed.
