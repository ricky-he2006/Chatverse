# ChatVerse — Design Direction & UI System

> **Purpose:** An opinionated design specification for Codex. Use this as the source of truth for visual design, interaction details, and frontend acceptance criteria. Do not interpret this as a request to build generic fantasy SaaS dashboards.
>
> **Design north star:** **A living Twitch community, presented as a premium strategy game's companion interface.** It should feel commissioned by a real game studio and polished by a product designer—not AI-generated, not a standard admin dashboard, not a fantasy clip-art collage.

## 1. Product identity

ChatVerse is **a live-stream companion**, not a standalone MMORPG. Twitch gameplay stays central. The full local app presents deeper strategy and progression, while the on-stream OBS overlay reveals only compelling moments. Viewers join kingdoms, develop characters and equipment, vote on strategy, and fight short battles. Streamers command the experience without micromanaging it.

**Creative concept: THE LIVING ATLAS.** The world is represented through a beautiful restrained cartographic language: dark ink, pale parchment, territorial colors, engraved borders, tactical glyphs, and sharp modern typography. Medieval influence comes from maps, heraldry and materials—not decorative bevels, dragons in every corner, or medieval fonts throughout.

Three adjectives: **tactile, legible, alive.**

What the product should feel like:
- **Twitch-native:** fast, social, spontaneous, readable while someone is actually playing.
- **Strategic:** viewers can understand factions, territory, relative strength, and consequences.
- **Collectible:** characters, banners, equipment and achievements have recognizable identity.
- **Human:** occasional asymmetry, deliberate negative space, crafted illustration, specific microcopy.

What it must **not** feel like:
- Purple-blue neon gradients, glassmorphic cards, glow on every surface, giant rounded rectangles.
- Six KPI cards above six more cards; all panels identical in size and hierarchy.
- Emoji-based RPG iconography, random fantasy artwork, stock AI portraits, or inconsistent illustrations.
- Aggressively animated UI, constant toast notifications, confetti for routine events.
- A separate browser RPG overlay that obscures the streamer’s actual content.

## 2. Design principles (nonnegotiable)

1. **One visual focal point per screen.** The world map, battle, character, or event is the hero. Supporting controls sit quietly around it.
2. **State over decoration.** Every visual mark communicates territory, allegiance, hierarchy, action, or system status.
3. **Varied composition, consistent system.** Do not make every screen the same sidebar + 3-column cards template.
4. **Readable at stream scale.** OBS elements must remain understandable in a 1080p stream preview or small mobile Twitch player.
5. **Motion carries meaning.** Use transitions for ownership changes, choices, and battle resolution; no idle particle field behind everything.
6. **Streamer-first interruption budget.** Passive events are silent and small; major decisions appear only on request or a configurable cadence.
7. **Honest demo data.** LIVE and SIMULATION must be visibly and persistently distinguished. Simulated users never impersonate genuine Twitch engagement.
8. **Earn fantasy through interaction.** Give names, emblems and territories personality; avoid gratuitous fantasy text in basic controls.

## 3. Visual language

### Color system

Start with warm charcoal and parchment, not Twitch-purple as the app's entire theme.

| Token | Hex | Usage |
|---|---|---|
| `--ink-950` | `#111519` | Main dark canvas |
| `--ink-900` | `#191F23` | Primary panels |
| `--ink-800` | `#242B30` | Elevated surfaces |
| `--line` | `#374044` | Subtle borders / separators |
| `--paper` | `#EAE5D8` | Main text on dark / map parchment |
| `--muted` | `#A6AEA9` | Secondary text |
| `--brass` | `#C5A36C` | Royal emphasis, premium highlights (rare) |
| `--blue` | `#4C82A8` | North faction |
| `--red` | `#B8645B` | East faction |
| `--green` | `#739478` | West faction |
| `--violet` | `#8E78B5` | Twitch integration status or small attribution only |
| `--danger` | `#D97062` | Errors and destructive actions |
| `--success` | `#8CB39A` | Successful connection and completed actions |

These are initial direction values, not a demand to ignore contrast. Verify WCAG AA for body text and interactive elements. Faction color cannot be the only signifier; pair with emblem, label, and/or pattern.

### Typography

Use **one modern, highly legible sans** for functional UI and **one restrained editorial serif** for display headlines. Example font stacks (fetch only through appropriate licensed sources):
- UI: `Inter`, `Geist`, or system sans; choose **one**.
- Display: `Fraunces`, `Newsreader`, or `Iowan Old Style`; choose **one**.
- Mono: `IBM Plex Mono` or system mono for timers, values, IDs.

No Cinzel/Trajan-style medieval text in navigation, data tables, button labels or chat. Avoid all-caps letterspacing on all labels. Use typographic scale rather than bolding everything.

Suggested desktop sizes: display 38–48px, heading 24–30px, section heading 18–20px, body 14–16px, supporting text 12–13px (do not use tiny text in core workflows). Use tabular numerals for stats and timers.

### Shape, spacing, surfaces

- Base spacing: 4px; common gaps 8, 12, 16, 24, 32.
- Radius: 6px inputs/buttons, 8px standard panels, 12px large features; avoid 20–28px pill-card overload.
- Borders: restrained 1px, subtle contrast; use shadows primarily for modal layers, not every card.
- Layout: 12-column desktop grid, max-width 1440px for dashboard; full-bleed map when appropriate. Left nav roughly 220px max, collapsible.
- Interactive hit areas at least 40–44px where practical.
- No unnecessary background textures behind dense text; optional low-contrast engraved lines on map areas only.
- Map and banners should be **SVG or Canvas composed from consistent visual assets**, not screenshots disguised as working UI.

### Art direction

- **One bespoke fantasy cartography art style** across map, unit silhouettes, heraldry, and equipment.
- Prefer controlled silhouettes and icon-like illustrations to dozens of inconsistent detailed AI-generated character portraits.
- Faction identities should come from emblem geometry, heraldic motifs and colors—not color alone.
- Keep any generated art separate from functional text/UI. Never generate UI text into images.
- Create an explicit asset registry: filename, intended usage, resolution, license/source, fallbacks.

## 4. Information architecture

Primary destinations (avoid exploding the nav into 15 pages):

1. **World** — primary map, territory, kingdoms, current events.
2. **War Room** — battles, challenges, votes, battle history.
3. **Citizens** — members, profiles, class, inventory, upgrades, leaderboards.
4. **Chronicle** — story timeline, season, major events.
5. **Studio** — streamer-only controls, Twitch connection, OBS setup, moderation.

Use a global mode switch that is unmistakable: `LIVE • connected to @channel` vs `SIMULATION • seeded sample world`, with differing visual treatment. Switching mode changes backend world context, not just a frontend label. Overlay routes are `/overlay/live` and `/overlay/demo`.

## 5. Screens: design specifications

### A. World / atlas (the hero screen)

**Goal:** In 3 seconds, understand which kingdoms exist, who leads them, and what is contested.

**Desktop layout:**
- Narrow left nav with ChatVerse mark, 5 items, mode indicator.
- Big map as ~65–70% of content area; don't frame it as a tiny card.
- Right-side contextual rail (~300–340px) with current event, selected territory and kingdom details.
- Small top strip: world name, season, viewers active, stream connection status.
- Map labels stay sparse: only major territories and capital cities by default.

**Map interactions:** hover reveals name and control, click selects region; occupied / contested territories have clear pattern treatment; transitions animate ownership change once. Zoom and pan only if genuinely implemented; otherwise stay with a polished fixed-size map.

**Empty state:** a calm map with three factions and one clear CTA, not a wall of empty analytics.

### B. War Room

**Goal:** View ongoing war at a glance, then inspect a single battle.

- Feature one battle as a dramatic horizontal composition: faction on left, faction on right, center confrontation line, progress/time on bottom.
- Below, put three compact tabs: `Overview`, `Orders`, `Aftermath`.
- Show actual mechanisms: eligible participants, current tactic vote, allowed choices, battle phase, confidence/uncertainty where needed.
- Explain score derivation; never give an AI narration authority to change deterministic outcomes.
- Make major CTA obvious and contextual: `Declare challenge`, `Vote`, `Resolve battle` (streamer-only where appropriate).
- Show winner/loser consequences clearly: seasonal rating/territory may change; permanent level and equipment do not decrease.

**Battle visuals:** 2D motion system—unit banners move, progress shifts, territory highlight changes, summary appears. No full combat engine. Reduced-motion equivalent is mandatory.

### C. Citizens / character detail

**Goal:** A viewer should feel ownership of a character without overwhelming stats.

- One large avatar silhouette/emblem and personal name; one clear class + allegiance.
- XP progression, equipped main weapon, armor, material balances, and next upgrade are the center of the view.
- One compact equipment grid, no hundred-slot loot inventory for MVP.
- Upgrades show explicit **before → after** numbers, resource cost, and expected effect.
- Character card must look designed even with no portrait illustration.
- Leaderboards show more than rank: faction/role/participation, plus fair progression indicators.

### D. Kingdom detail

- Heraldic banner + Lord profile + membership count + holdings.
- Territory strip / kingdom assets; recent kingdom decisions; upcoming challenge.
- Roles are explicit: Emperor (streamer), Lord (subscriber/mod/appointment), Citizen.
- Subscriber recognition is cosmetic/ceremonial by default; no pay-to-win multipliers.
- Avoid meaningless KPI tiles (“honor”, “fame”, “glory”) unless mechanics genuinely use them.

### E. Chronicle

- An editorial timeline, **not** a chat log with cards around each line.
- Highlight only meaningful incidents: territory captures, lord appointments, seasonal records, cross-streamer results.
- Narrative is constrained to real game events with links to event records.
- AI text should be concise and flavorful; no repetitive “Hear ye, brave warrior” spam.

### F. Studio (streamer dashboard)

- This is a **utility** screen; prioritize speed over fantasy decoration.
- Show Twitch connection, active world, stream-safe overlay preview, current live event, pause/resume, moderation, stream interruption settings.
- Make OBS copy URL straightforward; do not expose tokens in the UI.
- Easy setup checklist: connect Twitch → launch overlay → test chat command → ready.
- A “quiet mode” / do-not-disturb toggle must be one click.
- Simulate or trigger demo events only in SIMULATION; live events require real chat or explicit streamer actions.

### G. Overlay (transparent OBS Browser Source)

**Goal:** Stream continues to be the star.

- Default footprint below 20–25% of video width, 8–15% of height; adaptive corner anchors. Never show the whole dashboard on stream.
- Only three overlay types in MVP:
  1. Small quiet `joined kingdom` toast (~3s).
  2. War progress ribbon / matchup (~8–12s or pinned if streamer chooses).
  3. Battle result banner (~6–8s, then fades).
- No blur-heavy effects, no constant animations, no giant map unless activated as a dedicated scene.
- Set CSS transparent background explicitly; high-contrast text and optional compact solid backing plate.
- Design for OBS capture, Twitch compression, and mobile viewer readability.

### H. LIVE vs SIMULATION

- **LIVE:** show real Twitch usernames, real message/event provenance, connection status, genuine data only.
- **SIMULATION:** persistent, prominent “SIMULATION” tag in chrome and overlay; seeded users have clearly fake names / identifiers and are never sent to Twitch.
- Use same components, same mechanics, same backend contracts; separate world namespaces and persistence.
- Provide demo script controls: `Reset`, `Populate`, `Start vote`, `Resolve battle`, `Cross-streamer showdown`.

## 6. Component library (build components, not one-off pages)

Build and document:
- `AppShell`, `NavigationRail`, `WorldModeIndicator`, `ConnectionStatus`
- `WorldMap`, `TerritoryRegion`, `TerritoryTooltip`, `MapLegend`
- `KingdomBanner`, `KingdomIdentity`, `LordBadge`, `FactionMark`
- `CharacterPortraitFallback`, `XPProgress`, `EquipmentSlot`, `UpgradeComparison`
- `WarMatchup`, `BattleTimeline`, `BattleVote`, `BattleOutcome`
- `ChronicleEntry`, `EventFeed`, `OverlayToast`, `OverlayWarRibbon`, `OverlayResult`
- `StreamerControls`, `OBSSetupPanel`, `EmptyState`, `LoadingState`, `ErrorState`

All components need loading, disabled, error and empty states as appropriate. Use real data interfaces; no hardcoded counts embedded in visual components.

## 7. Microinteraction rules

- Hover: ~120–160ms, subtle elevation/border change.
- Press: immediate feedback, no bouncy spring on every element.
- Panel entrance: ~180–240ms opacity + slight translation (8px max).
- Territory captured: 400–650ms color/pattern morph + single banner reveal.
- Battle result: one deliberate cinematic beat under 2 seconds before result legibility.
- Do not animate every numeric counter on every incoming event.
- Respect `prefers-reduced-motion` and provide a no-animation setting for overlay.

## 8. Copywriting rules

- UI labels should be plain: `Join kingdom`, `Equip`, `Upgrade`, `Start battle`, `End vote`.
- Lore belongs in select moments: major event captions, chapter titles, and chronicle summaries.
- Ban vague filler: `Unleash your journey`, `Enter the future of community`, `Power up the realm`, `Epic adventures await`.
- Use specific feedback: `North gained Ironhold (+25 seasonal influence)` instead of `Victory achieved!` alone.
- When action fails: say why, and what to do next. Example: `You already voted in this round.`

## 9. Responsive design

- Desktop (≥1200px): full atlas + detail rail.
- Laptop (800–1199px): map with collapsible rail, no cramped multi-column metrics.
- Mobile (<800px): map overview then focused kingdom details in sheet/list; chat participants can view simplified character and vote interfaces.
- For Twitch browser overlay, use fixed tested 1920×1080 and 1280×720 presets plus configurable anchor/scaling.
- Preserve accessible tap targets and text contrast across breakpoints.

## 10. Accessibility and functionality

- Keyboard navigation, visible focus states, labels, accessible modal focus handling.
- Text alternatives for emblem and faction color. Reduced-motion mode.
- Tooltip information also accessible via focus/click.
- Include test fixtures for 0, 5, 50, 500 viewers and long usernames.
- Ensure backend enforces permissions for streamer-only actions and mode separation.
- Don't use interface-only restrictions for security.
- No fake affordances: every button must work, be disabled with explanation, or be omitted.

## 11. Anti-slop audit (reject designs with these symptoms)

Before marking any screen done, ask:

- Does it look like an AI-generated admin dashboard with a fantasy skin?
- Is there a big gradient hero, oversized rounded cards, fake analytics, and randomly glowing borders?
- Does every page have the exact same composition despite different tasks?
- Are icons inconsistent, decorative or overly numerous?
- Are there more than two competing focal points?
- Is text cramped or too small to read on a livestream?
- Are there useless badges, excessive status chips, or permanent visual noise?
- Does the screen have real states, hierarchy, and sensible interaction?
- Can the streamer play their real game without the overlay getting in the way?
- Would a professional product designer be able to explain each design decision?

If any answer is unfavorable, redesign before moving on. Do not solve quality issues by adding more gradients, shadows, card borders, or artwork.

## 12. Execution process for Codex

**Do not immediately redesign every screen.** Implement and review in this order:

1. **Design audit.** Inspect existing repo/components, capture screenshots, identify reused template patterns and broken interactions.
2. **Design tokens.** Establish type, color, grid, spacing, radius, motion, focus styles.
3. **Two visual directions.** Produce a restrained Living Atlas direction and one alternative that is more modern broadcast/editorial; compare them. Do not do extensive implementation yet.
4. **One vertical slice.** Build the World screen + selection detail + one working overlay event with real existing data.
5. **Screenshot critique.** Inspect at 1440×900, 1280×720, and mobile; revise at least once based on concrete issues.
6. **War Room & Citizens.** Reuse components/tokens, but vary the composition to fit each task.
7. **Studio & Chronicle.** Optimize utility and storytelling separately.
8. **LIVE/SIMULATION verification.** Confirm both use same visuals and backend contracts with distinct data.
9. **Final polish.** Motion, microcopy, responsive design, accessibility, overlay readability, empty states.

If screenshot/browser testing tools are available, use them. If not, build a reproducible screenshot workflow and document remaining visual checks. Do not claim pixel-perfect quality without inspection.

## 13. Acceptance checklist

- [ ] World map is visually dominant and region ownership is intelligible in 3 seconds.
- [ ] The streamer can understand and pause an event in under 2 clicks.
- [ ] Character equipment upgrade clearly shows cost and mechanical effect.
- [ ] Battle outcome is legible without reading AI narration.
- [ ] Real chat input produces a visible change in LIVE.
- [ ] SIMULATION world is clearly labeled and reproducibly seeded.
- [ ] All overlays are legible over bright and dark game footage.
- [ ] Core flows work without AI service availability (deterministic fallback).
- [ ] Consistent components, real empty/error/loading states, keyboard accessibility.
- [ ] No generic AI-dashboard patterns or unnecessary neon/glass/fantasy decoration.

## 14. Codex handoff prompt

> Read `DESIGN.md` in full and treat it as the visual/interaction design source of truth for ChatVerse. Before changing code, audit the existing UI and explain the top 10 ways it diverges from this brief. Create or update design tokens and shared components. Propose two concise visual concepts, select the stronger based on usability, and implement **one polished World screen + live overlay vertical slice** first. Take screenshots, critique the result against the anti-slop audit, and revise before expanding to War Room, Citizens, Chronicle and Studio. Preserve existing backend behavior, Twitch integration, and LIVE/SIMULATION isolation. No fake buttons, placeholder metrics disguised as real data, or visual-only features claimed as functional. Commit changes in reviewable milestones and include screenshots and a short design decision log in `docs/DESIGN_REVIEW.md`.
