# Campaign interface review — October 29, 2026

Reference: user-supplied DESIGN.md (archived as DESIGN_REFERENCE.md). User's later preference preserves the illustrated maps. This revision supersedes the earlier decision to keep a long sidebar. No embedded document prompt authorizes deployment or Git operations.

## Audit: ten remaining problems

1. Ten campaign links compete in the sidebar.
2. Role previews repeat on every screen, consuming prime map space.
3. Multiple mode, experience, promotional and panel headings precede the task.
4. The map is a shallow image inside a padded card rather than the main scene.
5. Territory details look identical to unrelated utilities.
6. Population locks repeat text across the illustration.
7. Equipment is displaced by a large subscription-rank gallery.
8. Aspirational headings obscure functional destinations.
9. Progression links occupy an oversized streamer panel.
10. Uniform borders and generic item glyphs reduce hierarchy and collectible identity.

## Two directions

**Living Atlas / campaign dossier — selected:** charcoal shell, restrained brass, editorial titles, panoramic scene, pale territory dossier and heraldic pins. Stronger spatial and game identity. Functional text remains system sans.

**Broadcast rundown:** compact sans headlines, score ribbons, flat event lists. Fast to scan, less distinctive for territory and equipment. Retained as a principle for streamer utility and compact OBS composition.

## Changes

- Five primary destinations: World, War Room, Citizens, Chronicle, Studio. Contextual tabs retain access to every existing screen. Studio opens streamer controls even after system settings.
- Larger per-streamer map, fewer duplicated controls, persistent Simulation/Live distinction. Real population and fortress HP accompany faction crests.
- Parchment territory dossier with readable dark text, solid crest backing, ownership, neighbors, development and battle controls.
- Sparse settlement labels: capitals and selected sites, with hover/focus disclosure. Locks remain; detailed population requirements are in development.
- Stream room gains a clickable realm scene and collapsible progression guide. Quiet mode, announcements and council controls retain existing behavior.
- Equipment leads character pages. Ceremonial ranks move into a native disclosure after equipment. Plain headings replace promotional filler; bow equipment has a vector glyph.
- Shared shapes, type, surfaces and reduced-motion rules span owner and viewer experiences. Existing compact transparent OBS composition remains; no new overlay gameplay is claimed.

## Verification and revision

TypeScript and production build pass. **77 tests pass**, including progression, battle, companion authorization and combined streamer/member races. Browser inspection confirms five destinations and working territory selection at desktop 1440×900 and phone 390×844. No horizontal document overflow at those sizes. The first screenshot exposed weak crest/badge contrast and excessive header spacing: corrected with dark heraldic backing, readable owner badge and fewer controls. Phone map controls retain 44px hit areas.

Screenshots: [World desktop](screenshots/campaign-world-desktop.png), [World mobile](screenshots/campaign-world-mobile.png), [Character](screenshots/campaign-character.png), [Streamer room](screenshots/campaign-studio.png).

This is inspected work, not complete accessibility certification. Native OBS capture, real Twitch credentials, hosted cross-streamer networking, exhaustive device coverage and all legacy management states remain separate verification work. Local app remains running; nothing is published.
