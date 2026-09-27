# ExitNow visual system

Current direction: photographic editorial, inspired by the user's Rains and BOC Studio references. Generated section comps, extraction notes, and prompts live in ../../docs/design/editorial/.

Palette: warm white #f2f1eb, charcoal #191b1a, signal orange #ed522d. Self-hosted Cabinet Grotesk (Fontshare) with wide, heavy, tightly tracked display type. Dark text on light surfaces; orange is primarily an accent. Typography and imagery create hierarchy without nested panels.

Homepage: original full-bleed subway photography, compact shared navigation, centered two-line hero, three-panel expanding image gallery, inline photo typography, marquee and oversized orange closing action. GSAP pins the gallery introduction on desktop and scales/fades imagery on scroll. Motion pause and reduced-motion support remain.

The landing hero follows ../../docs/design/editorial/hero.png using public/images/editorial-hero-matched.png, a generated text-free edit of that reference. Accessible HTML supplies the plain three-link navigation, large centered two-line headline, and white and orange calls to action. Mobile places navigation below the brand, reduces type and button sizes, and adjusts the photo crop.

Trip planner, live departures, and rewards share SiteNav. Utility pages use light backgrounds and fine rules. Live arrivals now appear beside station controls, ahead of the map. Rewards pairs its real iMessage access flow with commuter imagery; on mobile the form precedes the photo. Authenticated reward actions remain unchanged. Moderator retains its existing layout. Legacy reward links lead to the public rewards page.

Trip ETA sharing in app/eta-share.tsx is user-mediated: native device sharing, an SMS composer, or copying a message. Users choose recipients and send through their messaging app; there is no automatic delivery or tracking. Messages label synthetic demo trips, and stale routes require refreshing before sharing.

/research is an editorial city bottlenecks dashboard with deterministic, explicitly synthetic data for six stations. Weekday peak, off-peak, and weekend filters update station rankings and modeled delays. Selecting a station reveals a proposed pilot and illustrative improvement; visible methodology distinguishes these assumptions from MTA observations or forecasts.

Photos are generated concept imagery, not live train tracking. Google results, synthetic demo journeys, official MTA predictions, and devnet rewards retain explicit provenance and limitations. All map attribution and route controls remain visible.
