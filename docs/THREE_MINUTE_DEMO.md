# ChatVerse — full spoken demo and click guide (2:55)

Prepared 2 November 2026. Target 2:55, hard stop before 3:00. This version starts by welcoming the judges, explains the product in plain language, and gives the full presenter narration with matching clicks. Speak at a steady pace; let the Herald line play without talking over it. Rehearse once with a stopwatch. A complete election, ten-member race, setup flow and every screen cannot fit into three minutes.

## Prepare privately — outside the timer

1. Keep your connected normal app on **http://localhost:3000**. Show no secrets. Verify a real `!join north` in your actual Twitch channel before the take. Use a consenting viewer/test account; if already joined, describe the character as persistent rather than newly created.
2. Start a **fresh** rehearsal with `./start-judge-demo.ps1` from this repository. Stop only your previous rehearsal on port 3001 if necessary. The launcher creates fresh, separate Simulation storage; it does not reset Live. Unlock the rehearsal with its terminal code, off camera. Do not reuse the already-spent audit world for this script.
3. Keep four named tabs/windows ready:
   - **A — Twitch proof:** your real channel/chat, with the normal app's Live citizen result ready beside it.
   - **B — Streamer:** `http://localhost:3001/?mode=simulation&realm=emberwatch&screen=overview&view=streamer`.
   - **C — Citizen:** in B click **See citizen experience**. That navigates the current tab, so first duplicate B or reopen the Streamer URL in another tab. Confirm **Mira Stormweaver**, **SIMULATION PREVIEW**, and enough gold for one weapon upgrade plus 100 gold of fortifications. Keep C on **My story**.
   - **D — Overlay:** open the standalone Simulation overlay through **Overlay & setup**. Use the generated private URL if adding it to OBS; do not display that URL on camera. Select **Pin war ribbon during councils**. Keep Emberwatch selected everywhere.
4. In B, **Stream room → Royal Herald → Enable voice**, volume about 0.5, Frequency **Battle results and leadership only**. Keep **Quiet mode off**. Test sound before recording. Browser autoplay may require interacting with the overlay. Native OBS needs its own tested audio routing; see `ROYAL_HERALD.md`. Use one audible overlay, not both browser preview and OBS.
5. The fresh rehearsal has a **paused Frostpass council**. Leave it paused. Do not upgrade, fund, rally, resolve or change scenarios during setup. Those actions persist.
6. Have your own permitted gameplay background ready if demonstrating the overlay over a game. Do not use the transparent preview's white screenshot background as OBS proof.
7. Rehearse tab switches once. Keep notes and a stopwatch off camera. Do not open Lord preview yet: it changes the companion identity in this browser. Use it only after the citizen segment is finished.

## Full timed script — say the quoted lines

### 0:00–0:15 · Welcome the judges

**Click/do:** Start on the real Twitch channel or stream with ChatVerse's small overlay visible. Keep the game visible. Smile, look at the camera, then gesture to the overlay. Do not begin on a settings page.

**Say:** “Hey judges, thanks for watching. This is ChatVerse: it turns a Twitch community into a living kingdom. While the streamer keeps playing their normal game, viewers can join, grow a character, make strategic choices, and shape a shared world together.”

### 0:15–0:38 · Prove Twitch connection

**Click/do:** Start on A with Twitch chat visible. Send `!join north` in your authorized channel. Show the resulting named citizen in the **Live** app: **Citizens**. If the list needs it, search the viewer's name. Keep the command and saved identity readable; do not spend this segment in OAuth settings.

**Say:** “Let me show you that the Twitch connection is real. I’m sending `!join north` in chat. Here’s that same Twitch username appearing as a citizen in ChatVerse. Their character and progress persist in this world.”

Only say the second sentence when that actual proof succeeds. Connection alone is not proof of a received command.

### 0:38–0:47 · Mark the Simulation handoff

**Click/do:** Switch to B, the separate Simulation Stream room. Point out the Emberwatch map and the **SIMULATION MODE** label so judges can distinguish synthetic demo citizens from the Live Twitch account.

**Say:** “You’ve just seen real Twitch. I’m switching to a separate, clearly labeled Simulation so I can show the complete experience with fictional communities, without presenting demo activity as real viewers.”

### 0:47–1:02 · Give the viewer a character to grow

**Click/do:** Switch to C → **Armory & upgrades** → scroll to **Wayfinder Bow** → click **Upgrade weapon · [displayed price] gold** once. Show the new upgrade level, attack statistic and balance. Use the price displayed, not a memorized wallet total.

**Say:** “From the viewer’s side, participation earns experience and gold. Mira can spend that gold on an upgrade. Watch her bow improve and her attack stat change: equipment feeds into the same battle system. Supporter titles are cosmetic, so subscription tier doesn’t buy combat power.”

### 1:02–1:13 · Turn a personal choice into a shared investment

**Click/do:** C → **My kingdom** → scroll to **Develop your territories** → find **Frostpass** → **Fund next level · 100 gold**. Hold on **Level 1/3** and **+60 fortress HP**.

**Say:** “Progress also connects to the community. Mira can contribute her own gold to fortify Frostpass. That investment adds defending fortress health, and community growth can reveal new territory.”

### 1:13–1:32 · Let viewers shape the battle

**Click/do:** B → **War Room** → **Resume**. Switch to C → **My story** → **Pledge to this chapter** → **defend**. Show the recorded pledge and checked ballot. Switch back to B.

**Say:** “Now the streamer opens a short council. Mira pledges to her kingdom and chooses a tactic. Her ballot is private until the council closes, and every citizen gets one equal vote. The streamer can open this decision, then get back to playing.”

Do not click **Rally simulated citizens** until after showing the manual viewer choice. The full Simulation action will rally both sides automatically; synthetic ballots are demonstration activity, not real chat votes.

### 1:32–2:02 · Resolve the battle and hear the Royal Herald

**Click/do:** B → **Run full simulated battle**. Switch immediately to D to show the three recorded exchanges and the final territory result. Let the Herald speak; stop talking over it. Return to B if the overlay's result has already faded. If needed, **Replay chapter** shows the saved battle without paying rewards again.

**Say, before speech starts:** “The streamer advances the Simulation. Both sides rally, and the same deterministic battle engine settles the result for the app and overlay. Now the Royal Herald reads the recorded outcome using local speech—no language model or API key needed.”

**Then stay quiet.** Read the actual result; do not promise a particular winner or capture. Captures, defenses and draws depend on the computed outcome. Leave the result visible for at least three seconds.

### 2:02–2:13 · Show the viewer’s consequence

**Click/do:** C → **My story**. Show **Your last chapter**, the personal outcome, actual XP/gold reward and next upgrade target. Allow the companion's five-second refresh if needed. Do not upgrade a second time.

**Say:** “Back in Mira’s companion, we can see what the result meant for her: the chapter outcome, her actual reward, and what she can work toward next. That gives her a reason to return for the next stream.”

### 2:13–2:25 · Show community-wide challenges

**Click/do:** B → **War Room → World races**. Show one objective, **10 distinct approved members + the streamer**, and the 1st/2nd/3rd placement rewards. Do not upload or review evidence during this timed segment.

**Say:** “Communities can also compete on shared game objectives. A default race needs ten approved members plus the streamer. Evidence is reviewed by a person, and finish order earns community prestige.”

This shows the rules/interface, not a completed race. Do not claim automatic Valorant/Fortnite detection or a deployed worldwide service.

### 2:25–2:37 · Show leadership and kingdom identity

**Click/do:** B → **Studio → Stream room → Lord preview** → **Lord’s council**. Show the term/proposal interface briefly. Follow **Return to Stream room**, then **World → World atlas**. Show the named realm overview; do not launch another battle.

**Say:** “Leadership comes from elections: Lords can propose strategy, and the streamer makes the final call. Each streamer community has its own kingdom identity and persistent realm.”

The fixture Lord is seeded. This segment does not demonstrate a newly completed election or remote cross-streamer infrastructure.

### 2:37–2:50 · Keep the streamer in control

**Click/do:** Return to Emberwatch's **Studio → Stream room**. Under **Stream moments**, click **Clutch play → Confirm Clutch play**. Show the new event/caption. Click **Quiet mode off** so it becomes **Quiet mode on**. This is an explicitly simulated example; only describe it as a real clutch if you actually showed one.

**Say:** “For a real gameplay moment, the streamer can confirm a clutch or victory with one action. Quiet Mode silences interruptions. ChatVerse adds memorable community interaction without asking the streamer to stop the game and manage a second game.”

With the prepared Major-only voice frequency, this moment need not speak. Its visual/factual event is the demonstration. Stream Moments do not award extra combat bonuses or bypass daily caps.

### 2:50–2:55 · Close

**Click/do:** Keep the realm map visible. For an edited video only, optionally insert three seconds of your actual Codex work/test output, then return to the map. No terminal secrets.

**Say:** “That’s ChatVerse: the streamer keeps playing, and the community builds a world worth returning to. Thank you.”

**Stop at 2:55.** Five seconds remain for natural transitions. Do not add another feature tour.

## If time slips

- At 1:45, move to the personal result even if narration is long; lower/stop the preview audio. Never narrate a predicted outcome.
- If behind by ten seconds, skip the Lord/atlas clicks and say that sentence over the existing kingdom screen. Keep real Twitch proof, one viewer purchase, pledge/vote, battle consequence and streamer control.
- If a request or browser stalls, do not repeatedly click mutations. In a recording, stop and make a clean fresh take. Live, state that the screen is delayed and use a clearly identified previously recorded proof clip, if prepared. Never pass a replay off as a fresh successful action.
- If sound is blocked, say “The factual caption still works; local voice is optional.” Do not claim OBS audio worked.
- If Twitch is slow, use a clearly labeled recording of your own successful genuine command. Do not substitute Simulation or claim the connection badge proves viewer delivery.

## Recording versus live delivery

For a live presentation, follow the same 2:50 clock and use preopened tabs. For a video, record genuine Twitch, the continuous Simulation battle, and short supporting inserts separately; assemble to the same timing. Keep Simulation labels visible. Do not speed up speech until it is unintelligible or cut away before consequences can be read.

Shown through action: upgrade, fortification, pledge, tactic, settlement, personal reward, Stream Moment and Quiet. Shown as brief overviews: subscription recognition, population growth, races, leadership, realm atlas and persistence. Reserve complete elections, race evidence review, seasons, all subscription tiers and configuration for questions or supplemental footage.

This script targets 175 seconds of presentation. The presenter still needs one stopwatch rehearsal to validate actual clicking, speech and machine latency. It is not a rendered or timed recording.
