# ChatVerse project audit

Date: October 27, 2026. Starting revision: `52b65ed`. Scope: the current local-first application, not a hypothetical hosted deployment. No new product features were proposed as part of this audit.

## Assessment

**The local Simulation demo is substantially implemented and passes the checks below after repairs. Live Twitch readiness is conditional on a real broadcaster preflight.** Automated and browser checks do not establish that native OBS composition, real Twitch reconnects, or a multi-hour production stream have been verified.

The audit reproduced failures before applying repairs, added sixteen regression tests, and retained the original combat golden fixture. The resulting suite has **56 passing tests**, with a passing TypeScript check and production build. Both production-only and full dependency advisory checks returned **no known vulnerabilities** at audit time. This is an engineering review, not a security certification.

## Scope reviewed

| Area | Review |
| --- | --- |
| Backend and persistence | All server modules, SQLite schema, transaction boundaries, startup/restart, backup, installation lock and Windows token vault |
| Security | Local binding/Host/origin checks, authentication, CSRF, unlock throttling, path normalization, overlay capabilities, stream revocation, parameterized SQL and client-error handling |
| Twitch | OAuth state/session binding, refresh and disconnect races, EventSub lifecycle code, message deduplication, chat outbox, subscriber identity validation and cached rank freshness |
| Game systems | Membership, Lord elections/terms, gear and reward ledger, battle inputs/replay, population discoveries, challenges and seasonal archives |
| Frontend | All ten main screens, mode switching, polling/SSE synchronization, stale responses, forms, hidden/collapsed navigation, responsive layout and console errors |
| AI Steward | Deterministic facts, provider validation, budgets/fallback, delayed responses and interrupted work |
| Delivery | Package scripts, Windows launcher, Vite configuration, tracked configuration, ignored local databases/credentials, documentation and dependency advisories |

## Findings repaired

Priority describes impact within the current local application. None of these labels asserts a remotely exploitable Internet service.

| ID | Priority | Confirmed issue | Repair and evidence |
| --- | --- | --- | --- |
| A01 | P1 | An in-flight token refresh could recreate credentials after disconnect; an OAuth exchange could finish after its flow was cancelled. | Authorization epochs and captured-grant checks discard stale work, including after body parsing. Pending OAuth states are cleared. Startup/hourly validation respects cancellation. Two asynchronous regression tests pass. |
| A02 | P1 | A delayed AI response could modify a reused event ID after Simulation reset and update the new world's provider state. | Generation checks discard old responses and errors, including after shutdown. A held-response/reset regression reproduced the old mutation and now passes. |
| A03 | P1 | A successful gear command just after a council deadline could change the roster before the periodic scheduler settled the battle. | New viewer commands settle due work before applying changes. Exact receipt retries remain read-only. A late-upgrade regression verifies the old stats remain frozen. |
| A04 | P1 | Open SSE connections did not consistently recheck session logout/expiry; overlay backpressure was unbounded. | Streams recheck their session/capability and end when revoked, stop writing under backpressure and clean up on response close. Real loopback HTTP tests verify dashboard logout and overlay-key deletion terminate existing streams. |
| A05 | P2 | Old persistent announcements could be sent after reconnection; full queues could strand rows as queued. | Pending announcements older than fifteen seconds expire; rows are marked queued only after successful enqueue. Disconnect expires unsent work. Queue-full/stale-send regressions pass with mocked Twitch sends. |
| A06 | P2 | Equal character counts with different UTF-8 byte lengths caused a timing-safe comparison exception; expired unlock lockouts reused the old count. | Compare buffer lengths and start a fresh ten-minute attempt window. Unicode rejection and lockout recovery tests pass. |
| A07 | P2 | Archived equal standings received arbitrary distinct ranks. | New archives use competition ranks, with wins breaking kingdom score ties. Equal citizen contributions retain equal ranks; regression passes. Existing archived records are preserved. |
| A08 | P2 | The archive API's global award limit could consume its response on the newest season, hiding older seasons' leaders. | Return up to twelve recent seasons and three leaders per kind per season. A two-season archive regression confirms both receive their leaders. |
| A09 | P2 | A Lord could switch kingdoms while retaining the former kingdom's office. | Switching relinquishes active Lord terms with an explicit public event. Regression confirms the old office is vacant and the character loses its Lord badge. |
| A10 | P2 | An offline battle due before season end could be cancelled when rollover ran before settlement. | Rollover settles open councils due by that season's end before recording standings. Councils extending beyond the boundary are still cancelled by policy. Regression passes. |
| A11 | P2 | Interrupted AI requests and queued chat rows could remain stranded after restart. | Requested narrative work recovers to template; queued delivery recovers to unknown rather than being blindly resent. Backup/restore regression verifies these states and data integrity. |
| A12 | P2 | Malformed JSON and oversized bodies were reported as internal server failures. | Framework client errors retain 400/413 status with sanitized messages. Unexpected errors no longer promise that every external operation was rolled back. Regression passes. |
| A13 | P2 | Cached census/rankings could retain obsolete supporter tiers and contributions; overlapping snapshots could arrive out of order. | Lists refresh from current snapshots, older snapshot responses are discarded, and ranking refresh failures are visible. Background census refresh retains existing rows. Type checking and browser route checks pass; there is no dedicated React network-reordering test. |
| A14 | P2 | Collapsed navigation buttons lost their accessible names; hidden mobile navigation remained in the tab order. | Explicit names/tooltips and hidden-state visibility remove these defects. Mobile menu state is exposed with ARIA. Verified with browser accessibility snapshots and responsive checks. |
| A15 | P3 | Overview still reported four contested territories after expansion. | Calculate the value from unlocked noncapital territories. The seeded world has thirteen regions, ten noncapital. |
| A16 | P3 | Invalid effective power, seeds or side identities could produce invalid combat output instead of failing validation. | Reject invalid integer ranges, tactics and side assignments. Regression covers NaN, infinity, negative/fractional power and bad sides/seeds; the valid v1 golden fixture is unchanged. |
| A17 | P3 | An open chapter form did not update its selection when the valid target set changed. | Reconcile selection when adjacent eligible targets change. The backend continues independently enforcing adjacency, ownership, capital protection and cooldown. |
| A18 | P2 | A failing realtime observer could throw after COMMIT, trigger an invalid rollback and report a successful command as failed. | Commit handling is separated from observer delivery; failing listeners are isolated while other views are notified. A regression first reproduced the invalid rollback and now verifies the command, receipt and other notification succeed. |

## Verification performed

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Production frontend: `node node_modules/vite/bin/vite.js build` passed. JavaScript bundle approximately 344 kB uncompressed / 107 kB gzip; CSS approximately 111 kB / 24 kB gzip. Panorama approximately 2.75 MB, cached as a static asset.
- Tests: `node --import tsx --test tests/*.test.ts` passed **56/56**. Loopback SSE tests need local networking permission in a restricted execution sandbox. Twitch and AI network behavior in tests is mocked; no real channel messages were sent.
- Dependencies: `pnpm audit --prod` and `pnpm audit` returned no known advisories.
- Browser: unlocked an isolated `data/qa-audit` world, traversed Overview, World map, Kingdoms, Citizens, Character & gear, Battles, Leaderboard, Chronicle, AI Steward and Settings. No browser console errors were observed during this traversal.
- Interaction: created an actual Simulation council through the UI, pledged, cast a tactic ballot, rallied synthetic citizens, advanced Simulation time, and observed the committed result and frozen 1,980-HP battle sides. Live showed zero citizens and undiscovered frontiers, with no imported Simulation participants.
- Responsive: checked map, census, character and battle screens at 390 × 844. Document width stayed within the viewport; large maps/tables scroll inside their own containers. Temporary viewport overrides were reset. This is a responsive smoke check, not exhaustive accessibility/device certification.
- Storage: file-backed restart/mode isolation tests passed. An actual SQLite backup was restored with characters, gear and rank intact, `PRAGMA integrity_check = ok`, and no foreign-key violations. Active user databases were not modified by this audit's tests.
- Repository: tracked configuration contains `.env.example`, not the real `.env`, token vault, local databases or logs. No raw-HTML/eval rendering path was found in the reviewed application code. This is not a substitute for a dedicated secret-history scanner.

### Performance sample

Windows 10.0.26300, AMD Ryzen AI 9 HX 370, Node 24.22.1, SQLite 3.53.4. File-backed world with 10,000 citizens; final sample ran alongside build/test activity.

| Operation | Samples | p50 | p95 | Maximum |
| --- | --- | --- | --- | --- |
| World snapshot | 100 | 2.13 ms | 6.69 ms | 19.24 ms |
| Paginated census | 100 | 5.52 ms | 8.40 ms | 25.48 ms |
| Fresh join commit | 250 | 1.99 ms | 3.45 ms | 20.42 ms |

250 commands produced 250 stored receipts; database integrity passed; process RSS was about 106.9 MB. These figures do not measure Twitch rate limits, sustained concurrency, browser frame rate or native OBS overhead.

## Remaining gaps and release gates

1. **Real Twitch preflight remains required.** A consenting broadcaster must authorize, send a real join/pledge/vote, verify duplicate handling and reconnect recovery, test refresh/revocation, and verify subscription/gift tier changes. Subscription cosmetics reconcile by polling/manual sync rather than subscription-change EventSub topics. The audit checked code and mocked responses, not a real Twitch session.
2. **Native OBS preflight remains required.** The browser overlay and revocable read capability exist and are tested; native OBS transparency, composition over a game, reconnect behavior during capture and sustained performance have not been verified here.
3. **No multi-hour soak was performed.** The short benchmark is encouraging but does not establish stability for a full stream. Database/event/receipt history remains persistent without a retention policy; future long-lived operation needs measured storage/heap monitoring before a public-scale claim.
4. **Deployment scope is local and operator-controlled.** Live token storage uses Windows DPAPI. There is no hosted viewer account system, public deployment boundary, portable Live vault or granular delegated moderator administration. Viewers play through Twitch chat; the unlocked local browser is an admin-capable surface.
5. **Optional cross-channel war is not implemented.** Current kingdoms and races share one authorized channel realm. Separate installations do not federate battle state or challenge winners.
6. **AI integration is an optional compatible HTTP contract.** Templates work without a key. No real provider was called in this audit. The model supplies constrained atmosphere rather than authoritative game decisions.
7. **Planning documents contain broader aspirations.** Dedicated Lord proposal allowances, public recall petitions, a full moderation/suspension lifecycle and some broader faction/season mechanics are not all shipped. The current elected office, equal ballots, term limits and dismissal are implemented. [BUILD_STATUS.md](BUILD_STATUS.md), [WORLD_EXPANSION.md](WORLD_EXPANSION.md) and [SUPPORTER_RANKS.md](SUPPORTER_RANKS.md) describe current behavior more accurately than treating every original planning paragraph as a completed feature.
8. **Historical repairs are conservative.** Old archive rank numbers are not retroactively rewritten. New archives are corrected. Offline recovery settles due councils, but rewards and records use the processing clock; this is not a full historical event-time simulation of downtime.
9. **UI maintenance risk remains.** `App.tsx` and the CSS are large, and some original style rules are overridden by the later polish file. No broad rewrite was made during the audit. Keyboard/mobile smoke checks do not establish comprehensive WCAG compliance, screen-reader usability or every responsive breakpoint.

## Before the hackathon demonstration

Restart the updated local server, preserve a backup, run the real Twitch and native OBS preflights above, and confirm the demo clearly labels simulated data. Present only implemented behavior. No new feature work is needed to act on this audit; the remaining priority is validation of the existing integration boundaries.

Official references checked: [Twitch WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [at-least-once WebSocket delivery](https://dev.twitch.tv/docs/eventsub/websocket-reference/), and [sending/receiving chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/).
