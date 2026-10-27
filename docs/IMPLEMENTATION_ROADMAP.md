# Implementation roadmap

Plan dated October 26, 2026, America/New_York. Verified deadline November 2, 2026, 5:00 PM Eastern / 2:00 PM Pacific ([official schedule](https://twitchcon-codex.devpost.com/details/dates)). No implementation begins during this planning phase. Dates below are a single-builder planning envelope, roughly 36–42 focused hours through November 1, with November 2 reserved for submission contingency. If available hours are lower, reduce scope immediately rather than claiming these estimates are commitments.

## Architectural decisions for review

1. Chat is the complete remote viewer interface; local rich companion demonstrates UX. Public viewer hosting is a separate scope decision, not solved by localhost.
2. One TypeScript monolith, React/Vite, Fastify, SQLite and SSE. No 3D, distributed engine or production service infrastructure.
3. Live and Simulation have separate DBs, adapters and visible mode identity; same game engine/rules. Simulation cannot emit Twitch traffic.
4. Battle power is transparent scalar math with seeded three-round resolution and immutable replay inputs. Complexity belongs in meaningful choices, not fake physical combat.
5. Streamer gets short chapter presets, quiet mode and predictable output; routine progression stays viewer-driven.
6. AI narrates facts, templates are mandatory, subscriptions cosmetic. Neither can decide outcomes.
7. Cross-channel battle only after core gates, with both grants on one host. Distributed cross-stream federation deferred.

Tradeoffs and contracts are detailed in [ARCHITECTURE](ARCHITECTURE.md). Numeric game balance is a tuning proposal, not validated fairness. Final implementation should expose no nonfunctional “feature complete” controls.

## Milestones and acceptance gates

| ID / target | Effort | Dependency | Deliverable | Independently testable completion criterion |
| --- | ---: | --- | --- | --- |
| M0 — Oct 27 morning | 2–3 h | Plan review | Repo/runtime/bootstrap, contracts, DB migration skeleton, mode services, health | Node/npm available, locked clean install, SQLite smoke on Windows, same migration passes for both mode DBs, mismatched environment refuses start |
| M1 — Oct 27 | 4–5 h | M0 + broadcaster credentials | Minimal real Twitch vertical slice and secure local session | Actual OAuth callback validates subject/scopes; real `!join` persists correct sender in Live; UI sees committed event; duplicate event leaves one character; app restart retains it |
| M2 — Oct 28 | 5–6 h | M0; integrate M1 | Pure rules, economy, roster/tactics, elections, season jobs | Unit/invariant tests pass; concurrent upgrade cannot overspend; exact replay; election quorum/tie; restart/settle once; fixtures independent of Twitch |
| M3 — Oct 29 | 5–6 h | M2 + M1 ingress | Complete Simulation and Live command parity, API/SSE | 600 seeded citizens; scenarios repeat by seed/hash; profile/pledge/vote/equip/upgrade work; Simulation makes zero Twitch calls; mode switch does not leak cache |
| M4 — Oct 30 | 7–8 h | M3; tokens may begin in M0 | Coherent frontend screens, SVG map, transparent overlay | Every core UI route is functional or explicitly omitted; viewport/accessibility checks; chapter/election updates all views; OBS alpha and reconnect verified |
| M5 — Oct 31 morning | 2–3 h | M2–M4 | Steward templates + optional model adapter | Full demo with no AI key; model invalid/timeout falls back once; quiet switch and publication budget honored |
| M6 — Oct 31–Nov 1 | 6–7 h | M1–M5 | Reliability, security review, performance, rehearsal, recording | All mandatory tests/acceptance gates pass; real Live evidence and separate Simulation run; backup/restore verified; three-minute rehearsal and clean install documented |
| M7 — optional Nov 1 | 3–5 h beyond core budget | M6 green + second channel available | Same-host two-authorized-channel rivalry | Both explicit approvals, dedupe and scoped commands, one result/reward settlement; otherwise omit demo claim |
| Submission — Nov 2 | reserve | M6 | Final assets and submission checklist | Confirm official requirements, test artifact links/video, submit before actual cutoff |

Work in feature slices, not one frontend pass followed by a backend rewrite. M1 is deliberately early: auth/network uncertainty must surface before polishing the map. UI components can be stubbed with labeled fixtures in development, but no fixture can satisfy M1. A stalled M1 does not justify presenting Simulation as real integration.

## Milestone task breakdown

**M0:** initialize source control only when implementation authorized; install chosen Node toolchain; create npm workspaces and strict TS config; verify driver; create migration runner, health route, local bootstrap auth, shared command/event schemas and minimal CI scripts. Pin runtime and dependencies. No desktop packaging.

**M1:** register owner app and exact redirect; implement state/callback/vault/validation/refresh; create WebSocket state machine; receive and sanitize chat; persist idempotent join; expose minimal projection; prove live traffic with consent. Keep send-message integration behind owner enable toggle; inspect actual delivery response.

**M2:** implement thresholds/stats/gear/ledger; eligibility and election; seeded roster and rounds; transactional battle rewards/territory; scheduler lease/recovery; season score and rollover. Freeze fixture input/output hashes and explain calculation in a test report. This package has no network dependencies.

**M3:** implement canonical command dispatch and role checks, read projections and cursors, outbox, SSE resync/generation handling; build deterministic seed generator; write independent failure/edge scenario manifests. Complete chat help and all required commands before treating viewer loop as complete.

**M4:** build shared tokens/components and shell; Overview → Character/Shop → Kingdom/Election → Battle/Replay → Map → Rankings/Chronicle → Settings; optimize local read paths. Overlay consumes same projection/components. Use bounded authored art; visual polish after complete data flow. Mobile layouts support readable inspection; streamer setup remains desktop-first.

**M5:** templates first, provider contract second, optional configured provider third; budget/circuit breaker and grounded prompt validation. Avoid live AI dependence in demo. Record provenance with each narrative.

**M6:** run focused integration/E2E/security and load tests, OBS test, real account reconnect, portability/restore; fix critical defects, then visual QA with populated and empty worlds. Confirm competition rules, asset licenses and video format. Freeze features by October 31 evening; allow only fixes and rehearsal afterwards unless all gates already pass.

## Cut lines when time is tight

First remove M7, subscription recognition, cosmetic art variants, auto-chapters and optional live model calls. Then simplify citizens filters and map decoration, keep semantic territory list and one SVG. Reduce to one polished item style per slot and three authored scenarios. Keep all ten planning docs as design destination; deferred UI must disappear from navigation or show an explicit explanatory plan, never a fake active button.

Never cut genuine OAuth/EventSub proof, mode isolation, persistent core entities, command parity, deterministic settlement, reward dedupe, basic dashboard, transparent OBS, keyboard use, or factual labeling. Election and season rules can use compact panels instead of separate elaborate screens. If even these cannot fit, declare a narrower prototype honestly and renegotiate demo promises.

## Risks and decision deadlines

| Risk | Trigger / latest decision | Response |
| --- | --- | --- |
| No Node/native driver | M0 smoke fails | Resolve supported runtime/prebuilt driver before feature work; if necessary choose a compatible SQLite binding, update architecture and locks |
| OAuth account/app unavailable | End Oct 27 | Owner supplies/authorizes app; continue engine/Simulation independently; mark Live release gate blocked |
| Remote viewer web is mandatory | Before M0 | Re-estimate hosted auth/network/security, cut optional features; no unsafe exposure of local admin |
| Game system too broad | End Oct 28 | Freeze transparent v1 rules; no procedural RPG/loot complexity |
| Missing second streamer | Oct 30 | Drop M7 from promised demo |
| AI/provider budget absent | Oct 31 | Ship templates; no forced paid dependency |
| OBS performance/legibility poor | Oct 30 | Reduce animation/art, preserve alpha/readability |
| Organizer changes schedule | Recheck before submission | Preserve Nov 1 completion target; follow official updates |

## Review questions before code

Only material unresolved inputs: owner/team eligibility; realistic builder hours; consenting broadcaster/account capability; need for public rich viewer access; second-channel availability; optional AI provider/budget; permitted reference/brand assets. Official cutoff and submission requirements have been researched and are recorded in HACKATHON_DEMO. Defaults are in PRODUCT_SPEC. No need to ask about routine package/layout choices already proposed. Plan review is a stopping point requested by the owner, not an invented deployment approval step.
