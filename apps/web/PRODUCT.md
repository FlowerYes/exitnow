# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Confirmed: DivHacks judges view the pitch website. NYC subway riders use the application to decide when to leave and which line to take.
## Product Purpose
ExitNow combines trip planning, clear next-step guidance, transit observations, and verified test rewards. The pitch website introduces the project; a separate application performs the tasks.
## Operating Context
Mobile riders and desktop judges. Existing Next.js/React application, messaging gateway, MongoDB persistence, and devnet rewards prototype.
## Capabilities and Constraints
Google Routes and Places return real address-to-address journeys with the configured server key. At the user’s explicit request, the existing Maps key is also configured for browser Maps JavaScript; live browser map loading succeeded. Separate server/browser keys remain the recommended deployment configuration. Official MTA prediction integration exists for six stations. Expanded synthetic coverage must remain visibly labeled. Congestion in demo data is modeled, never claimed as Google crowding. Messaging requires live configuration and consent; never fabricate delivery or payment receipts.
## Brand Commitments
ExitNow name. User requests a cinematic pitch page inspired by Apple AirPods Pro and modern Siteinspire examples, with a beautiful existing train model/render replacing the rejected procedural train. The latest explicit redesign requests glossy, glassy, maximalist imagery inspired by Rains and BOC; the pitch now uses original cinematic concept artwork with scroll motion. Image-generated design references precede implementation. Working app is a separate destination.
## Evidence on Hand
Existing tests, live transit adapter, documented replay gateway, local synthetic data and reward fixtures. No invented customer endorsements or benchmark claims.
## Product Principles
Make the next action obvious. Identify sources and uncertainty. Preserve consent and verification. Keep demo and live data distinguishable.
## Accessibility & Inclusion
Keyboard operation and reduced-motion support; mobile web layouts.
