# Build status and verification record

Implementation session began October 26, 2026, America/New_York, after the owner approved building. This file distinguishes working code from the broader planning destination. No Twitch credentials were supplied and no messages were sent to a real Twitch channel during this build.

## Working scope

- October 27 full-project audit: sixteen regression tests added, 56 total passing; OAuth/AI cancellation, stream revocation, settlement timing, archives, Lord transfers, outbox recovery and frontend freshness repaired. Current readiness and limitations: [AUDIT.md](AUDIT.md).

- Cosmetic supporter ranks: Citizen, Knight, Baron, Duke; separate elected Lord badges; portrait accents and honors banners; Simulation previews and optional verified Twitch reconciliation. See [SUPPORTER_RANKS.md](SUPPORTER_RANKS.md). Updated suite: **40 tests**. Live subscription verification remains mocked pending a consenting broadcaster grant.

- Illustrated living atlas, persistent population-driven frontier discoveries, capped fortress-health combat (`chatverse-v2`), and daily realm challenge races. See [WORLD_EXPANSION.md](WORLD_EXPANSION.md) for rules, migration and verification. Updated suite: **40 tests pass**.

- React/TypeScript frontend with Overview, world map, kingdom/council, paginated citizens, character/gear/shop, chapters/ballots/replay, rankings/archive, chronicle, Steward and settings.
- Authenticated local Fastify backend, schema validation, CSRF/origin/Host checks, bounded requests and mode-specific SSE invalidation.
- Separate Live/Simulation SQLite files, transactionally persisted users/characters/items/ledger, receipts, ballots, territorial history, Lords, season standings and events.
- Shared deterministic combat: seeded roster up to 50/side, tactics/terrain, three rounds, frozen stats and input/output hashes. Reward/cost caps and once-only settlement.
- Equal-weight elections with nominations, frozen eligibility, replacement ballots, quorum, deterministic ties, seven-day Lord terms and streamer dismissal with public reason.
- Seeded 600-citizen world and five selectable scenarios. Current-season points originate from actual engine-resolved synthetic battles rather than decorative totals.
- Quiet controls, optional 30-minute deterministic chapters, streamer-confirmed game moments, in-app announcements and persistent template narration.
- Twitch authorization-code integration, session-bound single-use state, DPAPI token vault, validation/refresh logic, EventSub connection/reconnect code, command parser, optional subscriber lookup, bounded opt-in chat sending.
- Separate transparent OBS browser route, minimal projection, hashed revocable read capabilities, mode-specific overlay sessions and current-state recovery.
- Optional HTTP narrative contract, strict grounded output filtering, request budget/circuit breaker and template fallback.
- SQLite backup command and Windows launchers; complete source/setup instructions.

## Verification performed

Final TypeScript check and Vite production build pass. **All 56 automated tests pass**, including Windows DPAPI encryption, the installation writer lock and non-canonical-path authentication regressions. Tests cover numerical boundaries, deterministic RNG/rosters/replay, equipment spending, duplicate receipts/rewards, deadline and pause/resume behavior, electorate/quorum, seasonal archive, file-backed restart/mode mismatch, HTTP auth/CSRF/origin, overlay isolation/revocation, OAuth state, actual command parser and unsafe model fallback. The battle golden fixture was reviewed against its six explicit rolls (scores 656/607), not blindly updated.

Browser QA on the running production build: unlocked dashboard; launched a real backend Simulation chapter; pledged, changed tactic, rallied synthetic citizens and advanced the scheduler; observed a recorded result and rounds; upgraded a charm, observing its level, health and gold change together; visited main screen routes; inspected the 360-pixel character layout and measured no document horizontal overflow. A short-window sidebar issue was found and fixed. Overlay capability setup and a separate overlay browser tab load were exercised. Native OBS/game-footage composition is not yet tested.

A full server restart required a new admin code while preserving the upgraded charm (+3), health (160), gold (234) and battle result. Browser-computed overlay body background was `rgba(0, 0, 0, 0)`. Browser console showed no errors in the checked views. Screenshot artifacts are saved under ignored `test-results/`. The additional all-screen mobile sweep was not completed because the browser viewport capability targeted a stale temporary tab; only the observed character/mobile check is claimed.

Production dependency audit initially found four static-plugin advisories. Upgraded `@fastify/static` to 10.1.7, added raw-path rejection and regression tests, then reran `pnpm audit --prod`: **no known vulnerabilities reported**. This is a point-in-time registry check, not a guarantee of zero security defects.

Short file-backed performance preflight (`pnpm benchmark`) on Windows 10.0.26300 / AMD Ryzen AI 9 HX 370 / Node 24.22.1 / SQLite 3.53.4: 10,000 characters; 100 snapshot reads p95 **2.85 ms**; 100 filtered/paginated reads p95 **4.97 ms**; 250 fresh joins p95 **3.81 ms**, all 250 receipts accounted for; process RSS **111.8 MB**; SQLite integrity check **ok**. This excludes network/SSE rendering, is not the planned sustained burst test, and does not measure OBS FPS/CPU.

## Explicitly not yet verified or shipped

- Real-channel OAuth consent, live EventSub delivery, network reconnect against Twitch and actual chat sending need the owner's app credentials/account. Mock tests are not a substitute for that gate.
- Actual OBS alpha composition/performance and two-computer capture need an OBS session.
- Cross-channel wars are the optional M7 milestone and are not shipped. One real broadcaster per installation is supported.
- A public rich viewer website, distributed hosting, native Twitch polls/rewards, bot-account identity and automated game telemetry are not shipped.
- Live AI provider credentials/billing/provider-specific adapter acceptance are not tested. Deterministic template narration is complete.
- Fine-grained moderator delegation, privacy anonymization tooling, automatic retention pruning and a browser restore flow are later hardening work. This is a loopback developer-operated build, not a public multi-user service.
- The full long-duration performance target, external API fault matrix and WCAG contrast/axe audit remain release checks. Browser inspection alone does not establish those claims.
- Video capture/public upload, competition registration, participant eligibility and actual Devpost submission are owner tasks; nothing has been published.

## Intentional architecture refinements

Use Node 24 built-in `node:sqlite` and explicit migration SQL instead of a native driver/ORM. Use plain typed fetch and whole-projection SSE invalidation instead of TanStack Query and retained delta replay; reconnect always fetches the latest authoritative snapshot. Rewards/farming limits use a UTC campaign-day budget rather than guessed stream-session boundaries. The UI explains this. The optional model may add constrained atmosphere but never rewrite factual templates. All these changes reduce dependencies while preserving correctness and honesty.

Git was initialized on branch `main`. Source, lockfile, docs and launchers are reviewable locally; no remote repository or hosted deployment was created. Actual `.env`, databases, encrypted credentials, node_modules, builds and screenshots are excluded by Git ignore rules (verified).

The account's five-hour usage meter was monitored during work: 8% at the start and **58% at the final build check**, leaving 42% in that window at that observation. Account usage is not the same as elapsed wall time. The local preview server is stopped after QA; use `start-chatverse.cmd` to launch your own persistent session and get its fresh code.
