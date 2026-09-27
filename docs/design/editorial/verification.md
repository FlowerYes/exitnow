# Verification

- npm test: 129/129 passed. HTTP test requires loopback permission; first sandboxed run had one EPERM listener failure, rerun with loopback permission passed.
- npm run typecheck: passed.
- npm run build: passed after stopping dev server (concurrent Next dev/build use the same .next output; the initial concurrent build failed from conflicting output).
- Production preview checked at 1280×720, with real 390px and 700px iframe layout viewports in a temporary QA page. QA page removed after verification.
- Homepage: hero copy and two CTAs visible on short laptop and mobile; gallery photos loaded; expanding panel states and pause/resume control work.
- Planner: source switch to Demo and route submission returned three labeled synthetic options with itinerary and map. Google base map loaded; autocomplete and route logic not modified.
- Live: official arrivals loaded; Find a live route produced a current station-to-station journey and alternative. Board appears above map; provenance and freshness notes retained.
- Rewards: invalid private code gives explicit error and clears code; mobile renders sign-in before photo. Authenticated payouts were not submitted or browser-tested.
- Fresh independent code review found legacy embedded reward navigation missing page styling; corrected by routing to /rewards, with a scoped wrapper fallback. Shared navigation breakpoint raised to 760px and checked at 700px.
- Existing reward API, wallet and payout logic remains unchanged. No deployment or commits performed.
