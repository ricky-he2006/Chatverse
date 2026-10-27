# Testing, security and acceptance plan

These are planned checks, not executed application test results. During planning only environment inspection, documentation research and document verification are possible because the repository has no implementation. Test the same engine under both adapters; never assert correctness merely because a UI animation played.

## Test layers and fixtures

Vitest for pure rules, schema parsing, service/database integration and adapter fixtures; Fastify injection for HTTP role contracts; Playwright for full browser journeys; axe-core plus manual keyboard/contrast/OBS inspection. Use temporary real SQLite files, not an in-memory substitute for all transaction tests. Inject UTC clock, RNG seed, fake transport and narrative provider. Tests must not hit paid APIs or production channels by default. Real Twitch smoke is an explicit, consented integration session, separate from automated fixtures.

Fixtures: exact battle input/output/hash records; anonymized structurally valid EventSub welcome/message/reconnect/revocation payloads; synthetic OAuth denied/expired/missing-scope responses; seeded realm manifests. Provider fixtures contain no live secrets or raw unrelated chat. Event timestamps at close−1 ms, close, close+1 ms make boundary behavior explicit.

## Mandatory correctness matrix

| Area | Meaningful checks | Passing evidence |
| --- | --- | --- |
| Identity/join | Same sender repeated, changed display name, same user across realms, spoofed HTTP ID | One character per realm/subject; no display-name identity takeover |
| Progression | XP thresholds around every level, level cap, repeated claims, per-session cap/restart | Monotonic XP; no duplicate award; correct progress bar values |
| Inventory | Concurrent upgrades against final gold, wrong owner equip, wrong slot, stale version, upgrade cap | One debit max; balance never negative; gear/ledger/stat projection agree |
| Voting | Nonmember, late/changed/duplicate ballot, each side isolation, zero/tie, suspended user | One eligible final ballot; deterministic fallback; strict deadline |
| Election | Nomination, eligibility snapshot, quorum boundary, self-vote, tie, expiry/re-election limit, recall | Same seed/clock fixtures yield same Lord or explicit vacancy |
| Battle math | Ruleset hash, all tactic matchups, terrain, flooring, RNG zero seed, exact draw | Golden output and six rolls match expected values |
| Battle invariants | Shuffle input order, bounded stats, 1/20/50/51/600 pledges, no opponent | Same selected roster/result when order changes; capped roster; graceful cancel |
| Settlement | Duplicate close job, crash before/after commit, replay after gear change | Same input/output hashes; rewards/territory/score once only |
| Seasons | Exact boundary, active chapter, repeated rollover job, persisted XP/gear | One finalization/award set, correct territory reset, lifetime continuity |
| Persistence | Fresh/previous migration both modes, restart open/paused/locked chapter, backup restore | Integrity checks and row/ledger totals match |
| Mode isolation | Inject simulated event into Live, forged mode, reset URL substitution, cross-mode IDs | Rejection/no Live mutation; Simulation has zero Twitch client invocations |
| Event delivery | Duplicate provider IDs, semantic chat duplicates, backpressure, outbox retry | Accepted command durable once, safe replay, no reward loss |
| SSE | Snapshot race, Last-Event-ID, retention gap, generation reset, slow client, mode switch | No missed final state; explicit resync; no stale cache leaks |
| OAuth | Missing/reused/wrong state, denied grant, unexpected subject, missing scope, refresh concurrency | No session or connection falsely marked active; one refresh in flight |
| EventSub | Lifecycle fixtures, unexpected drop vs planned reconnect, revocation, malformed frame | Correct state/subscription behavior, bounded reconnect, visible gap |
| Chat send | 429, delivery drop, AutoMod, ambiguous timeout, echo, quiet and output disabled | Budget honored, no bypass, no duplicate automatic sends on unknown outcome |
| AI | Injection aliases, invalid JSON/facts, latency, no key, budget/circuit breaker | One grounded template at most; no canonical state effect |
| Permissions | Reader/mod/streamer/capability against every mutation | Deny-by-default; overlay never writes; scoped realm access |

Use property-based or generated invariant cases for arithmetic and economy where useful; do not chase arbitrary coverage percentage. Every critical engine branch above must have an explicit test. Treat ruleset fixtures as review artifacts: changes require intentional version update, not blindly updating snapshots.

## Browser acceptance journeys

1. **Simulation viewer:** load baseline → select synthetic persona → join/class → pledge/vote → view battle reward → upgrade → equip → reload. Verify map, character and leaderboard show same committed revision and all pages retain Simulation badge.
2. **Streamer:** start from clean setup → connect/check scopes → preview/copy overlay → launch one valid chapter → pause/resume → return after result → inspect chronicle; measure clicks and attention time. Mod cannot rotate keys or view credential configuration.
3. **Governance:** nominate two eligible seeded citizens, vote, close with quorum → show Lord across card, dashboard and overlay; second scenario fails quorum honestly.
4. **Mode switch:** change mode while queries/SSE active; no characters, events, narrative or persona from previous mode appear even transiently. Live has no reset/speed/persona controls.
5. **Failure:** take browser offline → show stale state, reconnect → snapshot correct; separately revoke Twitch grant → ingress disabled but local committed battle preserved; disable AI → next battle still narrates safely.
6. **Season:** advance Simulation clock through rollover, inspect previous standings, retained gear and fresh territorial contest. Live has no accelerated clock endpoint.

Run viewport 360×800, 768×1024, 1440×900, overlay 1920×1080. Keyboard-only navigation of map equivalent list, ballots, modals, shop and setup; dialog focus restoration; 200% text; reduced motion; long/non-Latin usernames; color-blind inspection. Automated axe has zero serious/critical violations; manual checks still required. Screenshots use stable synthetic data and intentional states, not brittle timestamps.

## Threat model and mitigations

Assets: broadcaster grants, local admin session, channel identity, immutable outcomes and viewer trust. Attackers: malicious chat input, untrusted website reaching loopback, forged viewer request, leaked overlay key, prompt-injection names and accidental operator misuse. A hostile process running as the same OS user is outside the hard isolation guarantee, but secrets still must not be logged or shipped.

- Bind to loopback; strict Host/Origin allowlists protect DNS rebinding and cross-site loopback calls. No wildcard CORS. Mutations require role session plus CSRF token, correct content type, bounded body and idempotency key. Protect OAuth state and bootstrap-code exchange. Server ignores client role/subject assertions.
- Store credentials under Windows DPAPI or tested equivalent OS vault adapter; scope references in DB; never ship a secret embedded in frontend build. Debug exports scrub tokens/codes/cookies/capabilities. Secret scanning and bundle inspection are release gates.
- Overlay uses high-entropy read-only capability, hash-at-rest, immediate revocation and minimal projection. It cannot query citizens' private records, controls or credentials. Token exchange does not create admin session.
- Validate all external payloads; allowlist command args, item slugs, faction/territory IDs and event versions. Parameterized SQL only; no eval, dynamic shell or raw HTML rendering. Escape names, narratives and event details. Reject overly long/unexpected Unicode-control names from model context.
- Grant moderator powers explicitly in app; Twitch chat moderator badge alone is insufficient for backend admin. All administrative changes and manual game signals have actor, reason and timestamp. Streamer-confirmed outcomes are labeled as such.
- Per-sender cooldown, realm queue bounds, aggregate output, no reward for message volume, frozen eligibility and snapshot roster prevent trivial farming. Multiple Twitch accounts cannot be perfectly defeated locally: disclose residual Sybil risk, avoid cash prizes and paid advantages. Do not claim bot-proof elections.
- Back up before migration, validate restore, require local admin/typed confirmation for destructive data operations. Simulation reset has no Live code path. Keep dependencies locked and review actual vulnerabilities at build time.
- Treat model provider as untrusted external processor; minimize facts sent, no raw chat or tools, validate/fallback. External outages never roll back an authoritative result.

## Failure policy

| Failure | User behavior | Recovery |
| --- | --- | --- |
| Twitch temporarily unavailable | Reconnecting badge with last-good time; no claimed real-time ingress | Bounded backoff and new subscription reconciliation |
| Authorization revoked | Reauthorize CTA, stop channel ingress/output and invalidate dependent sessions | New explicit grant; preserve world |
| Chat queue saturated | Prioritize requested replies/results, aggregate routine notices; show throttled count | Expire stale notices; never mutate result to match delivery |
| DB write unavailable/corrupt | Reject mutations; pause scheduler, show actionable error | Integrity check + verified backup restore; never silent new world |
| SSE disconnected | Stale banner, disable time-critical affordances | Resume cursor or fresh snapshot |
| Model unavailable | Template narrative with provenance | Circuit breaker, manual configuration repair |
| Server crashes mid-close | No premature UI success | Retry persisted job/snapshot exactly once logically |

Logs carry request/correlation IDs, mode, event/job IDs and safe error code, not full bodies. Health reports DB, scheduler, provider and Twitch capability separately. Provide local metrics for queue depth, command latency, duplicate count, SSE clients, refresh failures and narrative fallback rate. Diagnostic UI cannot reveal credentials.

## Performance experiment

Document test hardware, OS, runtime, driver/SQLite versions and dataset hash. Seed 600 citizens and a 10,000-character read fixture. Run eight browser/SSE consumers, 20 command attempts/s for ten minutes plus 100/s burst for 60 seconds. Report accepted/rejected/duplicate counts and reconcile every accepted command with DB receipts; deliberate rate-limit rejections do not count as data loss. Measure p50/p95 commit/read/event latency, memory, CPU, max queue and overlay frames. Targets are in ARCHITECTURE; a failure requires measurement and simplification, not an unsubstantiated performance claim. Replay should not re-run heavy queries every frame.

## Release acceptance checklist

- Clean supported-machine install and both empty DB migrations succeed; no untracked secret required in source.
- Real authorized Twitch message mutates Live correctly and reaches app/OBS; reconnection and duplicate fixture pass. A CLI mock does not count as real proof.
- Hundreds of simulated characters and named scenarios are clearly synthetic and deterministic.
- Persistent users, kingdoms, characters, gear, XP, territories, battle history and rankings survive restart.
- Complete viewer command loop and streamer chapter loop work; elections and season rollover are tested.
- Battle replay/calculation and once-only economy settlement pass; AI-disabled path works.
- Transparent overlay is visually verified in OBS, shared visual system and accessibility checks pass.
- No critical permission, token, mode-contamination, settlement or data-loss defects; lesser known issues documented honestly.
- Official submission conditions, asset rights and deadline are checked; demo claims match actual shipped tier.
## October 27 audit verification

The implemented suite now contains 56 tests. [AUDIT.md](AUDIT.md) records scope, fixes, browser checks, backup verification and benchmark results. `tests/audit.test.ts` includes actual loopback SSE connections; restricted sandboxes need local networking permission for those tests. Twitch/AI calls remain mocked. Passing this suite does not replace a real broadcaster authorization, EventSub reconnect and native OBS preflight.
