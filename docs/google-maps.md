# Google transit journeys and synthetic demo

`GET /api/journeys` returns 25 curated station complexes across Manhattan, Brooklyn, Queens and the Bronx, plus `googleConfigured` and `browserMapsConfigured`. Flags mean an environment value exists, not that billing, restrictions or API access have been verified.

`POST /api/journeys` accepts `{origin, destination, mode: "google" | "demo", preferFewerTransfers: boolean, demoCrowding?: "typical" | "rush-hour"}`. In Google mode, origin and destination are arbitrary place names or complete addresses (up to 500 characters), or catalog IDs for compatibility. Google resolves addresses directly; returned leg locations position endpoint markers. In demo mode they must be catalog IDs. Same-location, blank, malformed and oversized requests are rejected. Results use `JourneyResult` from `packages/core/src/journey-v2.ts`; every coordinate is `[latitude, longitude]`. Responses are `Cache-Control: no-store`.

## Configuration

For local Next.js development, put the required server key and optional browser key in ignored `apps/web/.env.local`, then restart `npm run dev`. For deployment, configure them before building; the public browser value is bundled at build time.

Set these in the web runtime environment, keeping server credentials out of version control:

- `GOOGLE_MAPS_API_KEY`: server key with billing and **Routes API** and **Places API (New)** enabled. Places is optional for suggestions; direct address routing only needs Routes. Restrict API access to the enabled APIs and apply suitable server application restrictions.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: separate browser key with **Maps JavaScript API** enabled and HTTP referrer restrictions for the exact development/production sites. This key is necessarily visible to browsers; never reuse the server key. Next.js public environment values must be present at build time.

The routing adapter calls `https://routes.googleapis.com/directions/v2:computeRoutes`, uses `TRANSIT`, asks for alternatives, allows the available transit modes (including buses), and passes `FEWER_TRANSFERS` when selected. These are Google preferences, not guarantees of a particular mode or multiple results. It uses an explicit response field mask and a ten-second timeout; redirects are rejected. No API key is sent in JSON responses, URLs, error messages, or logs by the adapter. There is no persistent Google response cache.

`GET /api/places?q=...` provides up to five Google place suggestions shaped as `{id,name,address,lat,lng}`, plus `attribution: "Google Maps"`. The server-side Text Search request uses the same server key and a 50 km NYC location bias, not a geographic restriction. Queries must contain 3–500 characters. Place search failure does not block direct address submission. Display Google Maps attribution beside suggestions. No server key is returned to the browser.

Google's returned transit stop times anchor the itinerary ETA, with any final returned walking duration added. The adapter preserves Google route duration, distance, line names and decoded polylines. Duration spans the returned recommended departure through final arrival; it does not include time spent waiting before that departure. Nearby walking-only results are supported. Incomplete or malformed route/time/geometry data, unsuccessful upstream responses, timeouts, and no-route results produce explicit errors. It never silently replaces a failed Google journey with a demo.

Google crowding and accessibility are **unknown**. Transit estimates may combine schedules and realtime information. They are not a promise of arrival, proof of realtime service, or observed train positions. The separate MTA endpoint continues to expose its own feed freshness semantics.

## Map display and attribution

Display Google Routes geometry only on a **Google Map**, retaining its visible attribution. Do not put Google route geometry over Leaflet/OpenStreetMap tiles. If the browser map is unconfigured or unavailable, show the text itinerary with visible Google Maps attribution and a map-unavailable state. Do not manufacture substitute geometry. Keep synthetic content visibly separate from Google content. Before public release, provide the applicable public Terms of Use and Privacy Policy.

Official documentation checked September 2026: [transit route options](https://developers.google.com/maps/documentation/routes/transit-route), [computeRoutes response and request fields](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), and [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), and [Routes policies and attribution](https://developers.google.com/maps/documentation/routes/policies).

## Demo boundaries

The deterministic demo supports 25 curated complexes across four boroughs using a connected graph of ten named subway services. Intermediate stops are omitted. It enumerates distinct simple station/service paths and ranks three alternatives by modeled duration, optionally adding an eight-minute transfer preference. Initial wait is four minutes; each transfer adds three walking minutes and four waiting minutes. The web demo explicitly selects typical or rush-hour crowding without changing the departure timestamp. Rush-hour modeled loads add segment time and can change route ranking; per-route crowding is weighted by segment travel time. Direct core calls without an override use 07:00–10:00 and 16:00–19:00 America/New_York (including weekends in this illustrative model). These are assumptions, not observations or official schedules.

The web API supplies the existing `public/map-data.json` geometry. A path uses a representative static line shape only when both station references are within 650 m of that shape. Complex-level reference positions can differ from individual platforms. Unmatched edges remain schematic station links. These paths are geographically illustrative; they are not exact platform routes, current train alignments, current service guarantees, or Google results. Static reference provenance remains in the source JSON. The demo graph does not cover Staten Island, all NYC stations, accessibility, fares, service days, or live disruption routing.

## Verification

`node --import tsx --test packages/core/test/journey-v2.test.ts` covers deterministic distinct routes, all catalog destinations reachable from Columbia, coherent timestamps, congestion effects, valid HTTP behavior, endpoint rejection, Google geometry/stop-time preservation, request preferences, missing configuration, malformed/empty upstream results, timeout, and secret-safe errors using fetch doubles. No paid Google requests are made by these tests.

Live verification on September 26, 2026 (New York time) confirmed the configured server key returns HTTP 200 from Routes and Places API (New). Public landmark trips Columbia University → Empire State Building and Brooklyn Museum → Flushing Meadows Corona Park returned real alternatives. The latter revealed Google can return single-point polylines for very short walking steps; the adapter now preserves these instead of rejecting the entire trip. The user subsequently requested testing the same configured key as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Maps JavaScript loaded successfully in the browser; the local configuration currently uses that key for both services. A separate restricted browser key remains the deployment recommendation. Live API success does not establish real-world ETA accuracy.
