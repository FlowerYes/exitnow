# MongoDB persistence

The gateway and Rider Rewards initialize their state collections with the shared MongoStateRepository. Use a replica set or Atlas deployment with transaction support. The repository acquires the state-document write lock before invoking application code; callbacks are never automatically retried because they may send notifications. Collections and indexes are initialized through the MongoDB driver. Startup probes a transaction before enabling live operation.

`node --env-file=.env --import tsx apps/gateway/src/verify-mongo.ts` initializes the journey_events unique eventId index and observedAt index, idempotently ingests eight labeled synthetic events and runs a real time-windowed aggregation with minimum cohort five. It requires MONGODB_URI and optionally MONGODB_DB (default exitnow). A successful run demonstrates the configured database operation, not live observations or Atlas hosting eligibility. No database execution is claimed without that run.

Gateway and Rider Rewards currently each use one state document with a 16 MiB BSON limit. This is a bounded demo architecture; partition state and implement retention before production-scale ingestion. Observation events are separate indexed documents.

## Rider Rewards additive migration

Startup adds `rider_rewards_state` with `_id: state` (MongoDB unique primary key) and a revision lock. It never renames, drops, copies over, or reuses historical treasury records. Existing gateway jobs, observations, and historical SQL migrations remain intact. Token liabilities and tasks share the same transactional lock; payout creation atomically moves payable credits into reserved credits. Signed bytes commit before RPC submission.

The funded campaign policy is persisted and frozen. Initial zero-funded use can transition to its first prefunded allocation without deleting unpaid reports. Changing an established campaign policy requires a reviewed additive migration; never reset the ledger. The runtime checks official devnet USDC funding before enabling a positive allocation. Back up data and test against a separate MongoDB database before deployment.
