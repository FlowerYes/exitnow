# ExitNow pitch v2 reference and implementation record

`hero.png`, `routes.png`, and `messages.png` are generated design references produced with the built-in image-generation tool before implementation. They are not captures of the shipped application. The direction contract calls for a cinematic, modern judge-facing pitch with an actual approaching 3D train, followed by a separate working application.

The implemented pitch lives in `apps/web/app/page.tsx` and `pitch.css`. Its hero combines procedural Three.js geometry in `train-scene.tsx` with generated atmosphere at `/images/pitch-atmosphere.webp`. Text and actions are native HTML; the comparison is interactive HTML plus SVG; the conversation uses CSS bubbles. `/images/train-studio.webp` is a WebGL-failure fallback. The reference image’s photographic train finish is directional, not a claim of exact matching.

The working planner is `/app`, implemented in `apps/web/app/app/page.tsx` with `planner.css`. `/setup` documents Google configuration and simulation limits. Product truth is in `apps/web/PRODUCT.md`; the extracted design system and surface briefs are in `apps/web/DESIGN.md` and `apps/web/.impeccable/`.

## Review evidence

The parent implementation agent reports visual inspection at desktop 1440×900 and mobile 390×844, including train loading and map controls. This document does not preserve those browser captures as image files and does not present the generated references as evidence of the rendered result.

An independent code review identified a manual playback override that prevented later scroll animation, a reduced-motion playback control that produced no movement, and schematic text implying direct map interaction. Follow-up source inspection confirmed that completion clears the override, reduced-motion CSS hides playback, and instructions point to the route choices.

No blind win against a named reference, exhaustive accessibility certification, or successful live Google API response is claimed. Google configuration and credentials remain prerequisites for real provider validation. Crowding and messaging illustrations must retain their visible demo disclosures.
