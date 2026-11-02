# Frontend and experience specification

October 28 implementation: [Living Atlas design audit, decisions and screenshots](DESIGN_REVIEW.md). Current shared tokens are in `src/living-atlas.css`; the ownership map now uses generated SVG cells and authoritative territory data. This supersedes older visual-token suggestions below. [Asset registry](ASSET_REGISTRY.md).

The implemented owner/viewer split and screen details are in [EXPERIENCE_PLAN.md](EXPERIENCE_PLAN.md). Stream room is the default; system management lives Backstage. Citizen and Lord previews open the separate personal companion.

Planning reference: [original image](assets/chatverse-reference.png). Build one coherent “illuminated campaign atlas”: dark ink surfaces, restrained luminous borders, faction heraldry and warm gold for achievements. The map, inventory, dashboard and OBS overlay are views into the same campaign, sharing terminology, badges, spacing and event components. Do not copy the reference's tiny text, dense infographic layout, illustrative arithmetic or apparent game telemetry.

## Design system

| Token | Proposed value / use |
| --- | --- |
| Canvas / surface / raised | `#080F20` / `#111C30` / `#18253C` |
| Text / secondary | `#F4F6FF` / `#B6C1D8` |
| North / East / West | `#52C9FF` / `#FF787F` / `#C596FF` plus shield/sun/moon crests |
| Achievement / focus | `#FFD16B` / `#A8DCFF` |
| Mode | Explicit “LIVE • channel” or “SIMULATION • synthetic world”; always text plus icon |
| Typography | Locally bundled licensed display serif for headings; system sans UI; tabular numeric figures |
| Scale | 4/8/12/16/24/32 px spacing, 10 px cards, 16 px modal radius, 1 px borders |
| Type sizes | 14 px minimum body, 16 px default, 24/32 px page/title; overlay minimum 22 px |

Validate final text/background pairs to WCAG AA 4.5:1 normal text and 3:1 large text; proposed palette is not a completed contrast audit. Color never conveys faction, state or winner alone. Gold means achievement/primary action, not purchasable power. Use one crest, character silhouette, item illustration family and icon stroke weight. No external runtime font/art dependency; supplied reference is inspiration, not automatically licensed game footage or production art. Track asset origins before submission.

Reusable components: AppShell, ModeBanner, ConnectionStatus, RealmSelector, FactionCrest, StatCard, CharacterCard, ItemTile, TerritoryBadge, ChapterStrip, VotePanel, BattleScorebar, EventFeed, ChronicleEntry, EmptyState, ConfirmDialog, Toast, CommandHint and OverlayWidget. The same BattleScorebar uses fixed props across dashboard/map/overlay; the overlay skin increases type and transparency without redefining meaning.

## Navigation and audience boundaries

`/` opens mode choice/onboarding. `/live/:realm/...` and `/demo/:realm/...` select independent modes. `/demo` redirects to seeded realm picker. Desktop sidebar: Overview, World Map, Kingdoms, Citizens, Character & Gear, Battles, Leaderboard, Chronicle, Steward, Settings. Kingdom detail includes Election tab; Character includes Inventory/Shop tabs. Streamer controls appear only in authorized dashboard context. A local “viewer preview” hides admin actions but is not an authentication boundary; server checks roles regardless.

Viewer experience: Twitch chat is primary remote interface; all core choices have concise command hints. Rich companion `/live/:realm/character/:id` is locally viewable; no claim remote viewers can open it. In Simulation a clearly labeled persona switcher permits trying viewer actions. Never offer Live viewer impersonation. Streamer experience: overview, preset launcher, quiet/pause controls and integration setup are optimized independently of progression screens.

Responsive rules: >=1280 px fixed 224 px sidebar, main 12-column grid with 24 px gutter; 768–1279 collapsible 72 px rail and 2-column cards; <768 drawer navigation and single-column cards, persistent top mode badge. Tables become labeled list cards or retain explicit horizontal scroll. Primary actions remain reachable at 360 px without whole-page horizontal overflow. Map has separate zoom/pan container and equivalent list; overlay uses a fixed canvas and separate safe-zone preview rather than mobile app navigation.

## Reference coverage inventory

| Reference panel | Implemented surface / treatment |
| --- | --- |
| Brand / feature column | Onboarding welcome and demo intro, not perpetual dashboard clutter |
| 1 Twitch livestream + chat | Real stream via OBS composition; optional preview frame in setup; commands and event provenance in app |
| 2 Dashboard | Overview with current chapter, KPIs, event feed and safe controls |
| 3 OBS overlay | Dedicated transparent route; campaign strip, toast, short battle replay |
| 4 Simulation | Same app shell plus synthetic badge, scenario controls and seeded world map |
| 5 Kingdoms & factions | Kingdom directory/detail and election panel |
| 6 Character & progression | Character detail, class, equipped gear and XP |
| 7 Battles & voting | Chapter detail, side-specific vote panels and replay/history |
| 8 Shop & upgrades | Character Inventory/Shop tabs with atomic upgrades |
| 9 System architecture | Documentation diagram / optional About content, not gameplay screen |
| 10 Data flow | Integration health activity trace / documentation |
| 11 Chat commands | Onboarding help drawer and command hints throughout |
| 12 Three-minute demo | Presenter script, not fictional app feature |

## Screen contracts

### 1. Welcome, mode choice and integration setup

Hero: logo, short promise, two CTAs “Explore Simulation” and “Connect my channel.” Simulation never asks for Twitch or AI keys. Live checklist: prerequisites, app credential setup, OAuth consent, verified channel/scopes, connection/subscription health, overlay preview. Credentials form is backend-only submission, masked input with no re-rendered secret. Show grant purpose and that optional replies send as the streamer. Permission denial leaves a retry path and no connected checkmark. First launch local admin bootstrap uses one-time terminal code, not a default password. Settings later reuses this checklist.

Help drawer lists `!join`, `!profile`, `!pledge`, `!vote`, `!upgrade` with examples. Preview uses synthetic sample labels, not a claimed real chat. No embedded Twitch player required for core demo, avoiding autoplay/player domain complications; streamer already has Twitch/OBS open. If later embedded, separately verify official embed requirements first.

### 2. Streamer overview

Header: realm, unmistakable mode, Twitch connection freshness, quiet toggle and profile menu. Top cards: opted-in citizens, active participants this stream (valid action in last 15 minutes), factions (three), current chapter state. Optional concurrent Twitch audience is separate with sample timestamp/unavailable state; never label citizens “total viewers.” Main 8-column chapter card, 4-column event feed; below: upcoming election, recent chronicle and steward health.

Idle CTA “Launch chapter” opens preset drawer: attacker, eligible target, default 60-second pledge window, reward summary and overlay preview. Invalid target explains adjacency. OPEN shows side-specific pledge counts, deadline and Pause/Cancel; confirm cancel describes no rewards. LOCKED/RESOLVED shows frozen scores and “View replay”; there is no forced winner. “Announce” opens editable draft and explicit publish; respects chat availability. Streamer-confirmed game milestone button has bounded preset list, source badge and confirmation; v1 records flavor context only, no combat buff.

Event feed has event type, safe actor name, time, source (Twitch/streamer/simulated/system) and deep link. Do not display raw chat content. Dashboard can complete a chapter with two launch clicks and no screen navigation. Mod view hides credentials/AI billing/key rotation while retaining delegated pause/cancel.

### 3. World map / Simulation landing

2D authored seven-region SVG with stylized mountains/roads and large labeled territory hit targets. Ownership changes crest, patterned fill and border; keyboard focus selects same region as click. Right inspector shows owner, adjacent eligible target, last transfer, and current chapter link; no blank decorative tooltip-only gameplay. Zoom controls +/−/fit, constrained pan and list-view toggle; mobile inspector becomes bottom sheet. Map art is background, territory geometry and labels remain DOM/SVG accessible.

Simulation-only toolbar: persona picker, scenario selector, pause ambient traffic, speed 1×/5×, reset seed. Reset dialog states all synthetic progress will be replaced; writes a new DB generation and resyncs clients. No reset control or seed injection endpoint in Live. A “SIMULATION — all citizens and events synthetic” badge persists in page header, overlay and exported demo frames. Baseline world is 600 citizens with North 220/East 200/West 180; reference's 320/280/260 are illustrative, not required counts.

### 4. Kingdom directory and detail

Three shared-format cards: heraldry, subtitle, citizen count, Lord or vacancy, territory count, season standing and View Kingdom. Detail tabs Overview, Citizens, Council, History. Overview uses same map inspector and chapter strip; citizens paginate/filter by class/level and link character. Council lists term dates, nomination/vote phase, eligibility and quorum with clear reason if ineligible. Self-nominate action and election ballot have matching chat commands; changing a ballot before close replaces it and announces success accessibly. Tie/quorum rules link to help. Streamer removal requires reason/confirmation and creates visible audit entry. No ordinary viewer “appoint Lord” button.

### 5. Citizens and character progression

Citizens screen: searchable paginated list, faction/class filters, level and contribution columns; 50 rows/page, no fetching all hundreds for each keypress. Character detail uses shared faction frame: portrait, class/name/level, XP `currentWithinLevel / requiredForNext` and lifetime XP in tooltip, gold, effective ATK/DEF/HP/SPD, equipped slots. Explain stats are ChatVerse campaign stats. Level cap explicitly reads MAX. Header keeps realm and mode, avoiding ambiguous cross-channel ownership.

Class picker previews base/growth changes and cooldown. Inventory slot click opens item comparison and Equip; operation disables while pending and reconciles server response rather than assuming optimistic gold. In Live local companion shows command hint instead of impersonating the character; legitimate authenticated self-write web access is a later hosted feature. Simulation persona can act directly. Missing/deleted character yields a scoped empty state, not a random fallback profile.

### 6. Inventory / shop / upgrades

Tabs Weapons, Armor, Charms; Kingdom upgrades shown as “planned” in help only, not an inert checkout tab. Item rows show art, slot, owned/equipped status, current upgrade, exact next stats and price. Gold is one shared balance from character projection. Buy/Upgrade opens confirmation with balance before/after; disables insufficient funds, cap or conflict with explicit reason. On commit update inventory, gold, stat sheet and toast together; on 409 reload item and ask user to retry with current cost. Small screens use stacked cards; all actions have >=44 px touch targets. No red rarity card suggesting unimplemented Dragon Blade powers; item names may be flavorful while mechanics remain explicit.

### 7. Battles and voting

History screen filters season/factions/outcome, chronological cards link replay. Active chapter page: territory, state, timer, own side pledge CTA, roster eligibility and three tactic buttons. Show own selected ballot, ability to change and cutoff. Aggregate tally is hidden until lock by default to limit bandwagon effects; streamer can inspect turnout only, not secretly manipulate counts. After lock, reveal side tallies, winning tactic, tie fallback and combat roster selection. User sees whether selected among 50 and reward eligibility.

Replay page: two crests, campaign score, three-round timeline, Play/Pause/Restart and Reduce Motion. Fast-forward changes presentation only. Calculation drawer exposes mean power, participation cap, terrain, tactics, seeded rolls, ruleset and hashes; zero votes and draw are clearly narrated. Scorebars are labeled campaign scores; never use game-kill terminology. Live “current battle” uses committed data and animation cursor, not a fake video thumbnail. Sparse/no-pledge cancellation gets a helpful “Invite citizens next chapter” state.

### 8. Leaderboard and seasonal archive

Kingdom and Citizens tabs with current season dates, score formula and prior-season selector. Separate lifetime character level from contribution rank. Table shows tied ranks honestly, eligibility and small sample sizes; no merging simulated and Live results. Season rollover banner links finalized chronicle and awards. Cross-stream global ladder is absent until fairness and verification work exists.

### 9. Chronicle and Steward

Chronicle timeline groups by session/chapter and links facts to battle/election pages. Each passage shows AI/template source and synthetic/source badge. Filter events, expand canonical facts, and see why a fallback occurred in streamer view. Steward settings show enable/tone, chat publication toggle, budget usage, provider health and preview. Owner can hide bad narration; canonical result persists. No chatbox suggesting a free-form autonomous operator. Generated output remains plain escaped text.

### 10. Settings, health and About

Tabs Integration, Overlay, Gameplay, Safety, Data, About. Integration displays exact capability status and Reauthorize/Disconnect; disconnect explains future ingress stops while stored world remains. Overlay setup includes copy URL, rotate capability confirmation, 1080p preview with safe zones and test toast. Gameplay presets specify chapter duration, election schedule and opt-in auto-chapters; rule tuning requires new ruleset and next-season activation. Safety has quiet/master stop and moderator delegation with audit. Data supports backup/export, restore instructions and privacy anonymization; restore is local admin only with typed confirmation and no active writes. About links rules, source attribution and design credits.

### 11. Transparent OBS output

No app shell, background, scrollbar or admin controls. Top/right 440×120 px campaign strip with crests, labeled scores/timer; bottom-left 540×90 toast; optional 540×250 battle vignette appears for at most 20 seconds. All within configurable 48 px safe margins; corner presets keep clear of game HUD. Idle may show compact CTA for five seconds per ten minutes; normal idle overlay otherwise empty. Notifications at most one visible, queue up to three and aggregate overflow; default overlay occupancy target <10% outside battle. Simulation badge cannot be hidden.

Reduced-motion mode uses fades <=150 ms, no screen shake/flashing; animated mode uses <=300 ms transitions and three short round reveals. Sound defaults off; no TTS in scope. Disconnect freezes no stale countdown: suppress expired battle and show compact “ChatVerse reconnecting” once, then quiet; recover from latest snapshot without replaying old alerts. UI mock preview uses checkerboard only outside actual overlay route. Alpha must be checked in OBS over bright and dark gameplay.

## Shared interaction and error rules

All pages have skeleton loading, no-data CTA, scoped not-found, permission denied and retryable error states. Pending writes prevent accidental double submits but server idempotency is still required. Connection banner distinguishes Twitch ingress health from browser SSE health and AI health. A stale view shows last update time and disables time-critical actions after loss; server still enforces deadlines.

Use semantic buttons/forms, visible focus, keyboard route navigation, labeled inputs and dialogs that trap/restore focus. Announce successful mutations and errors via polite live region; do not announce every countdown tick. Respect reduced motion, 200% text zoom and color-blind differentiation. Escape all names/narrative text, truncate visually with accessible full label, and never mount raw generated HTML. Test 360/768/1440 widths and 1920×1080 overlay with real text lengths, empty worlds and 600-citizen data before visual freeze.
