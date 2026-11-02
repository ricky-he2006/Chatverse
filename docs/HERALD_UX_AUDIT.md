# Royal Herald — Simulation UX follow-up

Date: 1 November 2026. This distinguishes fresh automated verification, fresh rendered evidence, and earlier visual evidence. It does not certify native OBS or genuine viewer commands.

| Journey | Evidence inspected / rerun | Assessment and remaining work |
|---|---|---|
| Discover and join | Chat command adapter, companion identity boundaries, `chat-release`, `companion` tests | Stable identity and duplicate message handling pass. Real Twitch discovery/reply remains external; no fabricated Live proof. |
| Character, equipment, XP and rewards | `world`, `personal-recap`, `companion` tests; earlier personal-result and ledger screenshots | Upgrade debits, caps, meaningful next-upgrade target and scoped reward receipts pass. No new progression mechanics introduced. |
| Vote and battle | `simulation-flow`, `battle-presentation`, `herald` tests; fresh Herald battle overlay screenshot | Two armies rally, ballots affect deterministic results, rewards settle once. Overlay displayed a defended Frostpass and exact HP. Owner-page refresh after this action needs another rendered check because browser control stalled. |
| Return next stream | Returning-citizen adapter tests, persistent world/reward tests | Character and equipment persist; capped daily welcome and next upgrade remain the return loop. Avoid promising unlimited rewards. |
| Streamer interruptions | Fresh Stream room voice control, Quiet toggle and Stream Moment interactions | Voice defaults off; no join/vote chatter; important announcements only. Embedded previews stay silent. A result can be verbose because both fortress totals are spoken; shortening this is P2 polish, not new gameplay. |
| Kingdoms and territory | Expansion/development/world tests; existing realm design and release evidence | Unlock requirements, contribution debits, adjacency and capture/hold rules pass. Fresh visual traversal of all realm maps remains incomplete. |
| Leadership | Election quorum, no-quorum, kingdom-switch relinquishment and subscription reconciliation tests | Lords are earned through the existing election system. Twitch subscription tiers do not grant paid combat advantages. Fresh nomination-to-appointment browser traversal remains incomplete. |
| Worldwide tasks | `world-tasks` tests | Member target plus separately verified streamer completion, receipt-time placement, private evidence, deduplication and restart persistence pass. Simulated races are not distributed production cross-streamer battles. |
| Stream Moments | `release-reliability` tests; fresh named moment and WAV playback | Streamer-confirmed facts persist once. Retry identifiers and generations prevent duplicate facts. No direct new reward payout bypasses caps. |
| Steward and Herald | Canonical-text immutability test, TTS test, actual WAV and browser playback | Optional AI enrichment cannot change the saved Herald facts. Windows local synthesis works; missing provider/blocked autoplay falls back to text. |
| Overlay | Fresh battle/caption screenshot, earlier 720p and 1080p release captures | Same recorded outcome as engine; Quiet hides events. Browser playback clock advanced. Native OBS routing, composition and gameplay recording remain external. |

## High-impact changes completed

1. Fixed the verified audio failure caused by using blob URLs under the existing Content Security Policy. Same-origin authenticated audio works without weakening CSP.
2. Added canonical event text independent of optional AI enrichment, scoped audio authorization and generation checks before/after synthesis.
3. Added bounded priority queue, freshness cutoff, Quiet clearing, reconnect/history suppression and local text fallback.
4. Cleaned up audio nodes on stop/unmount and report playback errors as text-only.

## Remaining priorities

- **P1 — owner War Room freshness:** repeat Resume → Run full simulated battle and confirm owner view leaves Open with controls re-enabled. During this session overlay settlement succeeded while owner inspection later stalled. Browser focus and navigation failed on multiple tabs, so root cause remains undetermined. Do not mark fixed from passing unit tests alone.
- **P1 — finish fresh rendered audit:** companion pledge → vote → result → upgrade/ledger, realm switching, election result, world-task evidence review and overlay reconnect. Existing automated coverage and earlier screenshots are evidence, not substitutes for this unfinished fresh walkthrough.
- **P1 external — actual OBS:** enable Control audio via OBS, record and listen back, check Quiet, volume and refresh with one audible source.
- **P1 external — genuine Twitch:** accepted viewer command and overlay delivery in the connected channel, separately from the synthetic rehearsal.
- **P2 — presentation:** adjust caption placement for bottom-left source anchoring and tune spoken result length based on a real gameplay recording. Keep controls subordinate to the map and battle; no new dashboard panels or unrelated mechanics are needed.

## Verification

`node --import tsx --test tests/*.test.ts`: 103 passed, zero failed/skipped. TypeScript and production build passed. Fresh media evidence: `screenshots/final-release/herald-voice-check.wav`, `herald-battle.jpg`. `herald-overlay.jpg` records the initial text fallback, not successful audio.

No native OBS audio or real Twitch-to-audio verification is claimed. The implementation is delivered; the full fresh visual audit is not yet complete because browser automation became unresponsive.
