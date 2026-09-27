# ExitNow interface polish

Reference: https://www.apple.com/airpods-pro/ (inspected September 26, 2026).

Visual direction: silver-white surfaces, near-black Outfit typography, electric-blue primary actions, open layouts, a sculptural subway image, and an always-visible top navigation. Generated references are trip-reference.png and rewards-reference.png. Generated imagery used the built-in image generation tool. The production train asset is apps/web/public/images/train-studio.webp (117,106 bytes); it is a rendered image with restrained GSAP motion, not an interactive 3D model.

Prompt summaries:
- Trip reference: a readable ExitNow desktop app opening section, Apple-inspired silver-white styling, two-line city headline, silver NYC train, top navigation, and a simple origin/destination planner.
- Rewards reference: open balance-and-guide composition, prominent contextual payout action, readable observation rows, explicit test-USDC label.
- Train asset: isolated brushed-silver NYC-style subway train, three-quarter front perspective, dark windows, blue A light, pale studio background, soft shadows, no branding.

Usability changes:
- Rewards access form appears beside instructions on desktop and before detailed steps on mobile.
- A contextual rewards action directs riders to wallet binding, confirmation, or continuation of an existing transfer.
- Eligible signed-in riders with a bound wallet request a payout in two app actions. Initial wallet ownership verification remains required.
- Web payout confirmation is checked atomically against the current amount and wallet before reserving credit.
- Expired access returns to code entry. Failed payouts are not described as pending.
- Trip station labels remain available while predictions load; identical endpoints have a clear validation message.

Verification: browser inspection at desktop and 390px mobile; no horizontal overflow observed on mobile. Live MTA route returned. A local fixture proxy exercised eligible balance, confirmation payload, pending payout, same-ID continuation, and finalization without any real transaction. The maintained Playwright script adds stateful payout and expiry fixtures, but that full script was not executed in this pass. Unit/integration and build results are reported in the task handoff.

Independent visual review preferred the external reference overall, and identified rewards form placement as the largest gap. That gap was revised. No claim of a blinded win or pixel-level parity is made.
