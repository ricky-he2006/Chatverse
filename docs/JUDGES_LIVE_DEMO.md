# ChatVerse — live judge walkthrough

**For the requested under-three-minute presentation, use [the 2:50 click-by-click script](THREE_MINUTE_DEMO.md).** This document remains the extended walkthrough and Q&A reference.

## The central story

**While the streamer plays, chat builds a kingdom.** Follow one viewer from earned gold, to a shared defensive investment, to a community decision, to a recorded battle. Use the atlas, roles and races as supporting evidence. Do not open with system metrics or spend the demo on settings.

The complete walkthrough is about seven minutes after the real Twitch proof. The short video is a separate edited 2:55 route: see [the recording script](JUDGES_VIDEO_SCRIPT.md). The interactive presenter guide is `/judges-demo.html` on the rehearsal server.

## Start a safe take

From the repository, run `./start-judge-demo.ps1` in PowerShell. It checks/builds the app and launches a separate server on **port 3001**, with a new directory under `data/judge-rehearsals/` for every run. Alternative after building: `pnpm demo:judges`. It never resets existing worlds or copies your normal Twitch tokens. Rehearsal ignores `.env`, strips inherited Twitch/Steward variables, and skips Twitch initialization. No model key is needed.

Keep the normal app on port 3000 for your real Twitch segment. Open **http://localhost:3001/judges-demo.html** for the guide, then Open rehearsal app. Unlock privately using this rehearsal's terminal code. The guide's timer only measures presentation time; it does not advance any game clock. Its links reuse one app window. If 3001 is already in use, stop your earlier rehearsal terminal before launching a fresh one; do not stop an unrelated process.

The launcher prepares 720 clearly synthetic citizens, Mira (`sim-0001`), North's founding simulated Lord (`sim-0002`), and a **paused** 180-second East-versus-North battle at Frostpass with seed 20261030. It does not preselect a winner. The fixture manifest lives in the new data directory. Each practice purchase is permanent in that rehearsal, so launch fresh data for a clean new take.

## Before the camera starts

- Record genuine Twitch proof in the normal app: an actual authorized-channel chat command and its resulting Live citizen/state. A connection badge alone is weak evidence. Do not treat a Simulation preview as Twitch proof.
- Open the rehearsal Stream room and its Citizen experience. Keep the owner app, viewer companion and overlay easy to switch between. A separate browser window/profile is useful for an actual viewer identity; Simulation previews are explicitly identity-bound fictional personas.
- Studio → Overlay & setup: send a test overlay event; generate/copy the source privately if using OBS; select **Pin war ribbon during councils** for the battle. Opening a URL without its read-only capability in an unauthenticated OBS browser will not work. Keep capability URLs and unlock codes off camera.
- Confirm Quiet mode is off. In OBS, place the source above your permitted gameplay/desktop capture, use 1920×1080, and check transparency/legibility. Browser screenshots may composite transparency over white; native OBS remains a manual preflight.
- Keep guide notes outside the recording region. Close unrelated notifications. Record build/Codex evidence separately from the gameplay take.

## Main route

| Stop | Do this | Show this proof | Say this |
| --- | --- | --- | --- |
| Handoff | Finish real Twitch segment; switch to the visibly labeled rehearsal | Real command first, synthetic population second | “That was real Twitch input. Now these fictional communities show the larger experience.” |
| Viewer ownership | Stream room → See citizen experience → Armory & upgrades. Upgrade Mira's equipped weapon once | Actual price, mechanical before/after, wallet deduction | “Participation earns gold and XP. Equipment changes real battle stats.” |
| Shared investment | Mira → My kingdom → Territory development → fund **Frostpass** level one | 100 gold debited; level 1; +60 defending HP | “A viewer can invest in a shared defense, not just a personal character.” |
| Population growth | Owner Realm map → North's growth row → Welcome 25 simulated citizens **twice** | 220→270 citizens, 2→3 outposts, 1,980→2,070 population fortress HP | “More people reveal land. Growth bonuses are capped; discovery persists.” |
| Community choice | War Room → Resume the prepared Frostpass vote → Rally simulated citizens. Change Mira's tactic if desired | Both sides pledged; replaceable sealed ballot; active pinned overlay | “The streamer opens a brief window. Viewers make the choice.” |
| Consequence | Run full simulated battle → inspect result → Replay chapter → Show final result | Winner and HP agree in overlay and app; actual recorded input includes district defense | “A seeded engine settles this once. The narrator cannot choose the winner.” |
| Persistence | Chronicle → newest battle; Citizens → Character & gear → gold ledger; Season standings | Recorded result/rewards, XP/gear retained, influence distinct from gold | “The stream leaves a persistent shared history.” |
| Narration | Studio → AI Steward | Actual provider status and factual recap | “No provider is configured in this take, so you're seeing the deterministic fallback. AI can add atmosphere when configured.” |
| World races | War Room → World races | Ten distinct members **plus streamer** gate, reviewer queue, placement prestige | “Communities race on shared objectives. Evidence is reviewed; receipt times determine provisional finishes.” |
| Roles | Stream room → Lord preview → Lord's council; return to owner inbox | Lord can propose; streamer reviews; subscription rank is cosmetic | “Elected leadership and final streamer control are different permissions.” |
| Realm identity | World → World atlas → Moonharbor → back to Emberwatch | Distinct artwork and isolated state | “Each streamer gets a realm. This is a local atlas, not deployed Live federation.” |
| Close | Quiet mode / streamer controls, then actual Codex change and current test result | Low interruption, working source and tests | “The streamer keeps playing; chat has a world worth returning to.” |

Mira's initial wallet supports one equipped-weapon upgrade and one level-one district purchase. Use prices shown by the app; do not hardcode a promised final balance after participation rewards. Population fortress HP plus Frostpass's 60 defense enters the frozen defender input. The battle can end with either winner or a draw; explain the computed consequence rather than promising a capture. The new battle remains in history; replay never awards again.

## Optional deeper proofs

### A full Lord-to-streamer strategy loop

After the prepared battle ends, open Lord preview → Lord's council. Select an eligible enemy border (typically The Crossroads for North) and submit. Return to Stream room → Council inbox → Accept & open council. Show the new battle, rally and run it. Proposal availability is daily and the target must still be adjacent/enemy-held/uncontested. Do not accept a second battle while the first is open or paused. Founding Lords in the fixture are seeded; do not claim to have just completed an election. For a real election walkthrough, use the existing election scenario in a **separate fresh rehearsal after the main take**, explaining its seeded candidates/ballots.

### A complete screenshot-evidence race

Use a new objective named **Demo evidence workflow**, game **ChatVerse Simulation**, objective **Submit a readable screenshot of your rehearsal armory or realm showing the objective is complete**, target **one member**, streamer requirement **on**, duration **one hour**. Explicitly say this is a short demonstration configuration; default game races require ten members plus streamer.

1. From the citizen companion's World races, submit an actual armory PNG/JPEG and an honest note. The authenticated identity binds the community; do not submit private desktop material.
2. Owner World races → inspect screenshot → approve with a reason. Show that one member alone **does not finish** while the streamer is missing.
3. Owner submits a **different** screenshot through the streamer-completion form, then reviews it. The streamer proof is role-derived server-side, not a viewer-supplied role label.
4. Show provisional completion. In Simulation, use Advance race clock 24h twice to pass the one-hour entry window plus 24-hour review cutoff. This is the competition clock, not Live time. Review every pending proof before Finalize placements.
5. Finalize and show 100 prestige for the first finisher. Prestige cannot purchase personal upgrades. Do not claim worldwide hosting or automatic game-result verification.

For full ten-member or multi-community placement proof, gather distinct, legitimate evidence from the required authenticated participants. Never manufacture eleven fake approvals and present them as real players. This longer workflow belongs in a judge Q&A or supplemental recording.

### Recovery and seasonal lifecycle

For persistence proof, finish a take, close/restart **that rehearsal's data directory** using `CHATVERSE_DATA_DIR` and port 3001, then show the same result and wallet. Running the normal launcher creates a **new** take intentionally; it is not a persistence restart. Season rollover and election quorum have engine tests and their own Simulation scenarios; record those separately rather than resetting the main take mid-presentation.

## What to keep out of the claim

No automatic Valorant/Fortnite telemetry, deployed worldwide service, genuine multi-channel Live war, verified hundreds of real users, newly completed real election, paid combat rank, or generated model response without a provider. Royal Herald is local deterministic TTS, not an LLM storyteller. The prepared screenshot/role/race screens are working interfaces, but merely opening them does not prove the full workflow was performed during the short video.

Use actual test-run output, not a hardcoded promotional test count. Native OBS capture, real Twitch proof and the final video edit are presenter recording tasks. The guide and script are not a rendered MP4.
