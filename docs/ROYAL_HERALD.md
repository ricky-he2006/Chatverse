# Royal Herald

The Herald uses deterministic text and local Windows System.Speech synthesis. No LLM, API key, network speech provider or paid service is required. Other hosts or missing Windows voices fall back to captions.

## Operation

In Stream room, enable Royal Herald, set volume, and choose balanced announcements or major battle/leadership results only. Quiet Mode immediately stops speech and clears pending announcements. Voice is off by default in every environment.

Audio plays in the standalone overlay, not the embedded Studio preview, to avoid double playback. Keep one audible overlay instance per realm. In an ordinary browser, allow sound for localhost and interact with the page before triggering a fresh event. A rejected autoplay request produces a text-only caption. Historical events are intentionally not spoken on page load.

The world stores an immutable `herald_events` row alongside selected authoritative events. Optional AI Steward edits cannot alter this text. Battle narration uses the recorded outcome and remaining fortress health. Councils, election results and appointments, and major streamer-confirmed moments are eligible; ordinary joins, ballots and upgrades are excluded.

Both Live and Simulation use the same event and delivery code. Rows remain inside their existing isolated world databases. The overlay uses its existing mode/realm-scoped read-only capability. Audio requests require a current generation, enabled non-Quiet voice, and a recent persisted event ID; arbitrary text cannot be submitted for synthesis.

The bounded queue prioritizes battle results over leadership over councils/moments. It permits one utterance at a time, applies a 12-second minimum start interval, retains at most five pending lines and discards events older than 30 world seconds. Initial snapshots and generation changes establish a cursor without replaying history. Existing event IDs are not re-enqueued on SSE reconnection. War Room replay is read-only and creates no narration events.

Windows synthesis runs in a hidden process with a timeout. Text is read from a temporary UTF-8 file rather than interpolated into PowerShell code. Generated WAV results are cached in bounded process memory; temporary files are removed. The text-provider interface is independent of synthesis and playback, allowing a separately validated optional AI provider later.

## OBS setup — external verification pending

1. Add the generated private overlay URL as an OBS Browser Source, using the same environment and realm as the Stream room.
2. Enable **Control audio via OBS** in the Browser Source properties. Verify that the source appears in the audio mixer and is not muted.
3. In Advanced Audio Properties, route the source to the recording/stream track. Use Monitor Off for stream-only audio or Monitor and Output if you also want to hear it locally.
4. Avoid capturing the same monitored sound again through Desktop Audio. Keep only one audible source/preview instance to prevent echoes.
5. Enable voice in Simulation and confirm a new Stream Moment. Record a short local test, listen back, then test volume, Quiet and source refresh. Refresh must not replay prior announcements.

These are setup instructions, not a claim of native OBS verification. Real Twitch-to-audio delivery and gameplay composition remain separate external checks.

## Verification and UX audit

The existing 98 regression tests passed before implementation. The expanded 101-test suite passed after the first implementation, including event selection, priority, cooldown, quiet, deduplication, world isolation, immutable canonical text and TTS fallback. TypeScript and production build passed. A real Windows-generated WAV sample is saved at `screenshots/final-release/herald-voice-check.wav` (193,372 bytes).

Browser verification used a separate 720-citizen Simulation rehearsal. Controls rendered with voice disabled initially; enabling voice and confirming a persisted Stream Moment produced a caption. The first playback revealed a CSP conflict with blob URLs; the fix uses authenticated same-origin WAV delivery. Subsequent browser inspection recorded `paused=false`, readyState 4, duration 10.84 seconds and currentTime 2.33 seconds, verifying local media playback. This does not verify speakers, native OBS routing or stream output.

The previous full product audit and release screenshots remain the baseline for viewer progression, kingdoms, Lords, tasks, battle rendering and streamer controls. This enhancement adds no combat calculation or progression changes. A fresh exhaustive visual walkthrough of every existing realm and every leadership/task interaction has not yet been completed for this enhancement; do not describe the earlier screenshots as new Herald verification.

### Final checks in this enhancement

- Full isolated suite: **103/103 passed**, zero skipped. TypeScript and production Vite build passed (1,606 modules).
- Additional tests reject unauthenticated audio, disabled voice, Quiet Mode, stale generations and expired events. Settlement narration is derived from saved results; repeating settlement produces no additional narration rows.
- Quiet was toggled in the rehearsal: the overlay hid events and speech. A real Simulation settlement displayed North holding Frostpass, East 1209/2070 HP and North 1482/1980 HP; the caption matched those values. See `screenshots/final-release/herald-battle.jpg`.
- After synthesis, the server rechecks capability authorization, generation and Quiet before returning audio. Playback errors retain captions; removed players are cleaned up.
- Later browser automation became unresponsive on both existing and newly opened tabs (focus/navigation timeouts, including after resetting the browser tooling session). The owner War Room had previously remained visually open after the overlay showed settlement. It is not yet established whether this was stale UI or the stalled browser. Treat this as an unresolved P1 verification item, not a confirmed repaired defect. API settlement, exact replay, rewards and overlay projection pass automated tests.
- The final build is on disk. The already-running Live server has not been restarted to load backend changes; restart it before using Herald in Live. No synthetic activity was written into Live.

See `HERALD_UX_AUDIT.md` for the evidence matrix and remaining visual checks.
