# ExitNow

Subway journey copilot with Rider Rewards for useful, verified transit observations. A cinematic pitch introduces the project; a separate rider app compares Google transit routes when configured or labeled synthetic journeys across 25 station complexes. Live MTA departures, network research and messaging replay have dedicated pages.

## Local preview

Use Node 22 or later.

```sh
npm ci
npm run dev
# A second terminal enables Operations → Run bridge replay:
npm run gateway:replay
```

Open http://127.0.0.1:3000. Replay never sends actual iMessages or creates settlement receipts.

## Pitch and trip planner

`/` is the judge-facing pitch with a real WebGL train. `/app` is the rider planner: 25 curated station complexes, route comparisons, map selection, and typical/rush-hour synthetic conditions. Google transit estimates require a Routes server key and a separate Maps JavaScript browser key; follow [setup](docs/google-maps.md) or visit `/setup`. Missing keys never produce disguised synthetic Google results. `/research` and `/operations` retain the separate research and messaging demonstrations.

## Live MTA connection

No MTA subway API key is needed. Start the web app and open **Live departures** at `/live`: arrivals refresh every 30 seconds, and **Find a live route** requests a journey from current MTA predictions. The server connects directly to the fixed official feed URLs through `/api/transit`; it never accepts an upstream URL from the browser.

Supported complexes: 116 St–Columbia University, Times Sq–42 St, 14 St–Union Sq, Court Sq, Bedford Av, and Hoyt–Schermerhorn Sts. Routing uses only trips present in the feed and verified transfers within these complexes; this is not a full-network trip planner. Stale/unavailable feeds and missing journeys produce explicit states, with no synthetic fallback. Step-free journeys remain unavailable because accessibility is unverified. See [transit details](docs/transit.md).

## MongoDB configuration

MongoDB is the authoritative database for gateway jobs, trips, consent, the notification outbox, and Rider Rewards state. The previous relational adapter is removed; this is not a dual-database setup.

1. Keep credentials in ignored `.env`, using `.env.example` as a template. Existing Grok Bot and Photon values have been moved there.
2. Set `MONGODB_URI` to an Atlas connection string and `MONGODB_DB=exitnow`. The runtime requires a replica set or sharded cluster for transactions; standalone MongoDB is unsupported.
3. For local development, run `docker compose up -d`. Its local-only replica set is reachable with `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`. No authentication is configured in this loopback-only local example; use Atlas credentials and network restrictions for deployment.
4. Run `npm run verify:mongo` to initialize state, ingest labeled synthetic observations idempotently, and query a time window with a cohort threshold. This writes only verification fixtures; it does not ingest private rider history.
5. Set `GATEWAY_MODE=live` only after configuring the Photon project, usable messaging line, Grok Bot routine, and public HTTPS gateway URL. Then `npm run gateway` runs the persistent bridge. Live transport currently uses explicitly labeled synthetic routing until the official-feed routing integration is completed.

See [database setup](db/README.md), [Photon and gateway](docs/photon.md), [Grok Bot routine](docs/grok-bot.md), [transit inputs](docs/transit.md), and [Rider Rewards](docs/rider-rewards.md).

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests cover deterministic routing, consent, obsolete jobs/results, HTTP replay persistence, and reward funding, verification, wallet ownership, and payout policy. MongoDB unit tests use driver doubles; a configured replica set is necessary to demonstrate real database transactions. Build/test success does not establish live sponsor operation.

## Deployment

The Dockerfile uses Node 22. Run the web process with `npx next start apps/web --hostname 0.0.0.0`; run a separate persistent gateway process with `node --import tsx apps/gateway/src/server.ts`. Configure Atlas and server-side secrets on the deployment platform. Route HTTPS to gateway port 8787 and web port 3000. Do not publish replay/operator endpoints without their intended controls. No deployment has been performed.

## Current boundaries

Grok Bot and Photon configuration is present, but an end-to-end live journey has not been demonstrated. MongoDB connectivity, transaction commit, and synthetic observation aggregation have been verified; see `artifacts/mongodb-verification.json`. Official MTA static GTFS ingestion has been exercised. The /app planner supports Google Routes when configured and a labeled 25-station synthetic demo. The /live page uses official MTA realtime predictions; the messaging gateway still uses synthetic routing. Gemini and devnet contributor payouts require their own configuration. Rider Rewards never substitutes a fake blockchain receipt. Live USDC payout is blocked until a developer-funded devnet signer is configured.

## Rider Rewards

`npm run demo:rewards` demonstrates the real gateway tools, blind checks, moderator verification, guidance update, fixed rewards, and duplicate rejection with **labeled local fixtures**. See `artifacts/rider-rewards-demo.json`. It sends no iMessage and fabricates no payout.

Open **Rewards** from the trip planner, or visit `/rewards`. Authenticate using a temporary code delivered through the existing private Grok Bot conversation; no wallet is needed to report. `/rewards/review` is the moderator workspace, protected by a separate server token. Positive campaign allocations require actual Circle devnet USDC funding at runtime. See [configuration, safe migration, and live demo](docs/rider-rewards.md).
