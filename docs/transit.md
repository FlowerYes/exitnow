# Transit engine and evidence boundaries

The Network research view and Operations replay use `demoNetwork`, a **synthetic**, six-node network named after NYC neighborhoods/stations. Its travel times, headways, routes between aggregated nodes, arrival uncertainty and costs are illustrative, not official itinerary advice. In particular, an aggregated G edge does not imply a G train serves Bedford Avenue. It must never be presented as live routing.

`planRoute` enumerates simple paths in this bounded network, evaluates directional service days/headways, walk limits, transfer penalties and disruptions, and returns two alternatives when possible. Accessibility defaults to unknown and accessible-only requests fail closed. Explicit progress confirmation is required after wrong-train reports. No positions or station exits are inferred. Notification eligibility rechecks consent and destination permission, five-minute ETA threshold, cooldown, incident deduplication and confirmed arrival; the gateway must call it again at send time.

`routeGtfs` is a separate timetable connection-scan implementation over parsed GTFS tables: explicit service dates, calendar exceptions, >24h timestamps, directions/headsigns, trip/route blocks and transfer links. Callers must perform timezone/service-date selection (including previous-day overnight service) and preserve stop/platform semantics. The separate ingestion CLI now parses and validates the six supported official ZIP/CSV tables. It remains separate from the web realtime planner. Accessibility across transfer links is unverified, so those links are excluded from accessible-only queries. It does not incorporate decoded GTFS-RT trip updates yet. Production route deployment remains blocked on full-network route validation and realtime integration.

`SharedFeedCollector` coalesces simultaneous requests and caches raw feed bytes for a configurable minimum of 30 seconds. It uses a ten-second timeout and retains stale bytes on failure. The separate `RealtimeCollector` adds standard protobuf decoding and source header timestamp preservation; fetchedAt is never substituted for a source timestamp. No automatic background polling is started by this package.

## Verified official sources

Read 2026-09-26: https://www.mta.info/developers . MTA distinguishes regular schedules from hourly supplemented GTFS that includes most, but not all, service changes for seven days. It publishes GTFS-Realtime and alert feeds with custom protobuf extensions and links the accessibility/elevator status resources. Official supplemented static-feed ingestion was demonstrated (receipt below). Historical OD coverage and current accessibility status have **not** been demonstrated. The application does not use MTA licensed maps or logos.

## Reproducible scenario calculation

`compareScenarios` uses exactly the same 120 synthetic requests for each intervention and reroutes every OD pair at the same departure time. It sums rider-weighted journey durations / 60 for passenger-hours and rider-weighted transfers. Frequency changes reduce waiting; the accessibility scenario alters verified flags solely inside its hypothetical network; the additional connection creates a modeled edge. All costs are demo USD millions, not extracted project budgets. Budget feasibility uses the conservative upper capital-cost bound; annual operating costs are separate. ±25% demand sensitivity is linear scaling, not a forecast. No app observation, feed snapshot, modeled value of time, or settlement is evidence of agency savings.

Fixture departure windows constrain boarding after interchange time and headway alignment. Explicit `continuationId` preserves an already-boarded synthetic service over consecutive edges without another wait; a common line label alone never proves through service. These IDs are fixture assumptions, not realtime trip IDs. Platform-level official routing should use the GTFS trip identities. The Queens/Brooklyn map is a schematic of these synthetic aggregates and must label itself as such.

## Official static-feed ingestion

Run from the repository root (Node + tsx and system `unzip` required):

```sh
node --import tsx packages/core/src/ingest-cli.ts https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip /tmp/exitnow-gtfs.json
```

A local ZIP path can replace the URL. The remote path is pinned to the verified official supplemented feed. The importer reads exact root-level entries through `unzip -p` argument arrays, never extracts archive paths to disk, bounds subprocess output/time, supports CSV quoting and calendar_dates-only service, and validates stop/trip/service references. It records retrieval time, HTTP Last-Modified and archive SHA256. It rejects missing stop times instead of silently interpolating them. Parent-station metadata, pathways, frequency tables, and shapes are not yet imported.

Actual retrieval on 2026-09-26T19:37:11.457Z parsed 1,488 stops, 76,819 trips, 2,296,420 stop times, 16 calendar rows, 67 calendar exceptions and 613 transfers. HTTP Last-Modified: Sat, 26 Sep 2026 19:24:49 GMT. SHA256: `fb34bcf01e61961a6b87168ebe3a5d55f079823860a8b191bb1923dee07324b3`. This proves feed ingestion, not full-network route correctness or live predictions. A small receipt is saved under `packages/core/evidence/` and the large parsed file remains outside source control in `/tmp`.

## Standard GTFS-Realtime decoding

`packages/core/src/realtime.ts` loads the vendored official GTFS-Realtime schema using protobufjs. Schema source: https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto (Apache-2.0; upstream copyright/license header retained). Standard trip updates, vehicle payloads and alerts are decoded without turning them into rider boarding events. MTA custom extensions are not interpreted.

The decoded snapshot preserves header timestamp separately from fetchedAt; missing timestamps, old timestamps and implausibly future timestamps mark the snapshot stale. Differential snapshots are rejected because no merger is implemented. Concurrent collections share one request; failures retain stale snapshots and impose exponential retry backoff capped at five minutes. Default successful polling cache is thirty seconds, but this utility does not start its own background process. The collector URL is server configuration, not a public user-controlled endpoint. Tests encode explicit synthetic protobuf fixtures and check prediction timestamps, missing timestamps, coalescing and failure backoff. Live retrieval is now exercised by the web integration described below.

## Feasible bundles

`compareScenarios(budgetMillions).bundles` evaluates all eight subsets of the three synthetic interventions. Each bundle combines network changes before rerouting the same demand, rather than adding independently calculated savings. Capital bounds and operating costs are summed. Feasibility uses the upper combined capital bound; operating costs remain a separate annual commitment. Construction interactions and nonlinear cost effects are not modeled.


## Web MTA realtime integration

`GET /api/transit?station=queens` returns the supported station catalog, upcoming predictions at the selected station, and per-feed freshness. `POST /api/transit` accepts `origin`, `destination`, current ISO `departureTime`, and optional `preferFewerTransfers` / `requireAccessible` preferences and returns a prediction-based `RoutePlan`. The server uses fixed MTA subway endpoints published at https://api.mta.info/; no API key or browser credential is required. RealtimeCollector shares concurrent requests, caches for 30 seconds, times out after ten seconds, and backs off failed feeds. Source timestamps are retained; stale feeds cannot supply a journey or arrival.

The curated station/platform IDs and within-complex transfer allowances were checked against the official supplemented GTFS file. The planner uses explicit future stop-time predictions and actual trip identities, excludes canceled trips/skipped stops, and supports connections only within the curated complexes. It does not extrapolate beyond available predictions, apply delay values to a static timetable, infer boarding or provide a full-network optimal route. Arrival estimates are predictions, not guaranteed times; no invented uncertainty range is shown. Accessibility and MTA custom extensions remain unverified.

Your trip displays feed health and refreshes arrivals every 30 seconds. Routes are requested using the current time. Network scenarios and the messaging gateway continue to use their labeled synthetic fixtures; MTA data is not evidence of observed rider demand or modeled infrastructure savings.

The decoder bundles `packages/core/proto/gtfs-realtime.json`, generated from the adjacent official `.proto` with protobufjs `Root.toJSON()`, so Next.js does not need a runtime schema filesystem path. The original schema and its license remain vendored.

Live end-to-end verification: `node scripts/verify-mta.mjs` (web app running; optional `APP_URL`). The receipt at `artifacts/mta-verification.json` records the retrieval time, feed source timestamps, upcoming arrival count, a real prediction-based journey, and invalid-station rejection. This is point-in-time evidence, not a continuous uptime guarantee.
