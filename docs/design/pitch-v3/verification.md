# Verification — September 26, 2026

- Generated and inspected three section-specific reference images before implementation.
- Inspected actual Tekt and Little Plains sites linked from Siteinspire.
- Replaced rejected procedural train with SQUIR3D official publisher preview and working external interactive viewer. Nested iframe was unreliable in the integrated browser; no claim that the pitch itself contains an interactive mesh or scroll-driven train.
- Browser checked at 1440×900 and 390×844. Fixed collapsed mobile line breaks, tightened train framing, and added View directions after independent reviewer found mobile itinerary too far below route choices.
- Keyboard place selection (ArrowDown/Enter) resolved Brooklyn Museum to its full street address. Address-to-address requests returned six alternatives in browser; results invalidate immediately when input changes.
- Real Columbia→Empire State and Brooklyn Museum→Flushing Meadows routes verified. Walking substeps consolidated for display. Travel duration, recommended leave time and arrival time are explicit.
- User requested reuse of server Maps key for browser testing. Google map loaded and actual route overlays rendered with Google attribution; console had no errors. Keep key values out of documentation and logs.
- 129 automated tests passed; TypeScript passed. The HTTP gateway test requires permission to bind a loopback port.
- Separate reviewer identified concrete gaps; fixes applied. This is not a claimed blind design win against Tekt, nor proof of real-world ETA accuracy.
