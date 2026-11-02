# ChatVerse release verification

Verified 1 November 2026. This report closes the code remediation for audit findings D1–D10. External broadcast checks remain listed below; a passing local suite does not establish Twitch delivery or OBS composition.

## Finding-by-finding evidence

| Finding | Status | Implementation and verification |
|---|---|---|
| D1 | Implemented; locally verified, Twitch delivery externally unverified | `server/world.ts` records one opted-in chapter invitation and persisted resume timing. `shared/overlay.ts` re-exposes the council on resume. `tests/chat-release.test.ts` covers opt-in, quiet, invitation dedupe and resume. |
| D2 | Implemented; locally verified, Twitch delivery externally unverified | `server/twitch.ts` permits bounded consecutive commands, records rejected message receipts and sends bounded retry guidance. Adapter tests cover join/class/pledge/vote, duplicate IDs, rejected votes and returning citizens. |
| D3 | Fixed and verified | Companion tactics require a pledge; inline feedback expires when the chapter phase changes. `server/personal-recap.ts` reads actual reward rows and gives an equipment savings target. Companion and personal-recap tests cover win/loss, caps, cancellation and identity boundaries. Earlier browser walkthrough confirmed pledge → Defend → personal result and upgrade target. |
| D4 | Fixed and verified in browser; native OBS externally unverified | `src/BattlePlayback.tsx` is shared by War Room and overlay. It uses recorded exchanges, exact health, recorded tactics and actual held/captured/drawn consequences. Pause resumes at the current exchange; replay restarts only after completion. Static/reduced-motion summaries and duplicate-notice filtering are included. Screenshots below show 720p and 1080p. No combat calculations or reward endpoints were changed for replay. |
| D5 | Fixed and verified locally | Setup proof requires an accepted join receipt and persisted character matching the authorized channel and world generation. Ordinary chat cannot satisfy it. Disconnection hides proof; explicit disconnect clears it. Live races report zero/one channel truthfully. Authorization was subsequently reported successful by the user; end-to-end real viewer commands still need recorded evidence. |
| D6 | Fixed and verified | Stream room puts Pause/Resume, Quiet and the battle timer above the map. Connection settings explicitly opens Twitch, including after visiting OBS settings. Browser walkthrough verified both routes and first-viewport controls. |
| D7 | Fixed and verified | A stable logical action UUID and generation bind a milestone receipt. Event and receipt commit in one SQLite transaction; retries return the original event, conflicting labels and stale generations fail. No direct XP/gold payout. Tests cover concurrent retries, legacy transport retries, invalid labels and all four current Stream Moments. |
| D8 | Fixed and verified | The open companion ledger refreshes after successful actions and polling, with a request sequence guard. Private ledger rows join the actual chapter and reward; expanding a row shows the recorded consequence and HP. Browser upgrade showed the debit immediately plus its separate daily welcome reward. Identity-scoped API regression passes. |
| D9 | Fixed and verified locally | Expired queue entries are removed before admission and even while offline. Important announcements and write acknowledgements are prioritized within the existing send budget. Automatic chapters require a connected Live world and recently active citizens on both sides. Tests cover saturation, expiration, budget, empty, one-sided, disconnected and inactive worlds. |
| D10 | Fixed and verified | Overlay parity asserts a populated `outputHash`, recorded rounds and winner. Frostpass seed 2 fixtures cover a hold and a capture through a genuine ballot difference, exact intermediate HP and unchanged rewards. Additional tests cover duplicate notices, draws and legacy score presentation. |

## Verification runs

- Baseline: 84 tests. Phase 1: 89; Phase 2: 91; Phase 3: 92; Phase 4: 96; final suite: **98/98 passing**.
- Latest rerun: `node --import tsx --test tests/*.test.ts` passed all 98 with loopback access. The restricted initial run failed only the two SSE network tests with `EACCES`; rerunning with loopback access passed them.
- `node node_modules/typescript/bin/tsc --noEmit` passed.
- `node node_modules/vite/bin/vite.js build` passed; 1,604 modules transformed.
- Twitch setup subsequently exposed leading whitespace in `.env` values. `server/index.ts` now trims the value before stripping quotes. The local credentials were corrected without printing them. The user then reported Twitch connected.
- The latest audit return reran automated checks and the build. Visual evidence below comes from the earlier remediation walkthroughs in this same release session, not a new native OBS test.

## Visual evidence

- [Viewer result](screenshots/final-release/phase1-personal-result.jpg)
- [Replay pause](screenshots/final-release/phase2-paused-replay.jpg)
- [Updated personal ledger and linked battle](screenshots/final-release/phase4-ledger.jpg)
- [Named Stream Moment on overlay](screenshots/final-release/phase5-overlay-moment.jpg)
- [720p battle result](screenshots/final-release/phase6-overlay-result-720.jpg)
- [1080p battle result](screenshots/final-release/phase6-overlay-result-1080.jpg)
- [Final Stream room controls](screenshots/final-release/final-stream-room.jpg)

Browser captures composite transparent overlay pixels onto white. They do not demonstrate native OBS transparency over gameplay.

## Remaining external verification

1. In the authorized Twitch channel, a real viewer sends `!join north`. Confirm the setup proof names that saved citizen. With chat output deliberately enabled, confirm the reply arrives in Twitch. During an open council, send `!pledge`, then `!vote defend`; verify persisted participation and the personal result after a legitimate settlement. Repeat a reconnect and confirm no duplicate invitation or award.
2. Add the private Live overlay capability URL to native OBS at 1920×1080. Show a named moment and a legitimate result over actual permitted gameplay. Check safe margins, transparency, Quiet, reduced motion and readability at 720p output. Keep capability URLs off camera.
3. Royal Herald spoken narration is now implemented with local Windows TTS and verified browser playback; see `ROYAL_HERALD.md`. Native OBS audio remains unverified. If demonstrating model-generated storytelling, configure a provider and capture an actual response; no LLM is required for the Herald.

One local installation authorizes one Twitch channel. Simulated multi-realm events and local evidence-reviewed races are not distributed cross-streamer infrastructure. The separate judge rehearsal is suitable for demonstrating the broader mechanics after real Twitch proof; it is clearly synthetic.

No release commit was created: this checkout already contains extensive uncommitted application work, and bundling it into an audit-only commit would misrepresent the scope. No Live reset, forced battle winner, new currency, paid combat advantage or direct Stream Moment payout was introduced.
