# ExitNow editorial redesign

References inspected: https://us.rains.com/ and https://boc.studio/work.
Rains: photographic full viewport, compact floating navigation, huge readable headline.
BOC: charcoal and orange, open editorial alignment, image sequences and thin utility typography.

Built-in imagegen used for hero, gallery, rewards, live and CTA references; separate original raster photos used in implementation. No reference website photography is copied.

## Extraction before implementation
- Hero: white two-line centered headline spans roughly 65% viewport width. Supporting line sits 24px below, two pill actions 28px below. Photo covers viewport with neutral black overlay. Implementation: 72rem max width, clamp typography, 660px minimum desktop hero, short laptop CTA visible.
- Gallery: warm paper background, massive black heading with inline photo, three touching panels 2:1:1. Captions low in each panel. No rounded enclosing section. Implement grid-auto-flow:dense, 3 items for 3 tracks with no empty cells; mobile vertical accordion.
- Rewards: warm white page, two-line black headline with orange punctuation, open photo/form split. Numbered steps are functional instructions, not decorative chapter labels. Form stays real HTML. Generated image invented Telegram/Discord/email access: reject these and retain actual private iMessage code workflow.
- Live: giant two-line title, fine separator, flat departure rows with large minute values. Utility area immediately follows heading. Generated arrival values and station list are illustrative only; never implement as fixture or fallback. Use existing official feeds and freshness logic.
- Typography: Cabinet Grotesk local WOFF2, weight 800 display, 500 body, 700 controls; tight -0.055em display tracking, 1.0 line height. Body 15–18px, 1.5 line height.
- Color: #f2f1eb warm white, #191b1a charcoal, #ed522d accent. Avoid white small text on orange; use black or darker orange for accessible text.
- Components: 48px pill actions, square photos, 1px neutral separators, minimal shadows. Focus rings clearly visible, disabled controls explicit.
- Motion: pinned editorial gallery introduction on desktop plus scroll image scale/fade; hover image scale; typographic marquee. Motion pause and reduced-motion disable continuous/scroll animation. No mobile pinning.

Seed from normalized design request character count: 222. Python random.Random(222): Cinematic Center, Cabinet Grotesk; Infinite Marquee / Horizontal Accordions / Inline Typography Images; Scroll Pinning / Image Scale & Fade Scroll.
