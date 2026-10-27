# Reproducible worlds and hackathon demo

Verified target: Codex × TwitchCon Hackathon 2026. Submission closes November 2, 2026 at 5:00 PM Eastern / 2:00 PM Pacific ([official schedule](https://twitchcon-codex.devpost.com/details/dates)). Finish the core recording by November 1 and aim to submit by noon Eastern November 2, preserving five hours of contingency.

The [official rules](https://twitchcon-codex.devpost.com/rules) require newly created submission-period work, working Twitch functionality, accessible source/setup, a description of Codex use, and a Codex session ID. Video should be under three minutes, publicly visible on YouTube, and show both Twitch operation and how Codex built the project. Materials need English or translation and authorized assets. Owner must check personal/team eligibility. Keep the submitted artifact frozen after cutoff; maintain judging access. The rules and schedule disagree on judging dates: preserve access through November 15 rather than relying on the shorter schedule.

The [overview](https://twitchcon-codex.devpost.com/) lists equally weighted judging areas: originality, streamer/community impact, technical implementation including Codex use, and design. ChatVerse should demonstrate community choices, low streamer effort, a real end-to-end integration, and consistent readable visuals rather than spend the video listing speculative features.

## Demo thesis

“While the streamer plays, chat builds a shared history.” Show a real command and a durable consequence, then an explicitly simulated larger world. The streamer should spend only a brief break launching a chapter; viewers perform the interesting choices. A beautiful map alone cannot prove this value.

Use one coherent fictional realm, three faction crests and consistent palette everywhere. Keep active map territory, battle target, character inventory, dashboard score and overlay headline synchronized. No separate fake video used as the battle engine. Game footage, music, logos and art must be licensed/owned or permitted by submission rules; the reference image is not blanket permission to reuse its game imagery.

## Seed generator design

Create a deterministic generator using a versioned seed, fixed ruleset/catalog hash, injected UTC clock and stable numeric/ASCII ordering. Proposed manifest:

```text
scenario: baseline-600
generatorVersion: 1
ruleset: chatverse-v1
populationSeed: 20261026
clockStartUtc: 2026-10-27T18:00:00Z
population: 600
factions: north=220, east=200, west=180
classes: deterministic balanced rotation
levels: 1..12 weighted toward 2..6
synthetic: true
providerSubjectPrefix: sim:
```

Names use authored fantasy syllables plus stable suffix, e.g. `Mira-Sim042`; no real Twitch profiles/photos scraped or generated claims of real users. Avatars use locally licensed silhouettes and palette variants. Titles, portraits and subscriber-like cosmetic labels always carry synthetic provenance. Include non-Latin, long and repeated-looking names in edge fixtures separately from camera-ready world.

Generate users, membership history, characters, legal XP thresholds, inventory, equipment, activity windows, season scores and chronicle through migrations + deterministic service commands where practical. Fixture setup may import a validated snapshot for speed, but the production battle/award service must create displayed battle outcomes. Never seed impossible negative gold or current XP inconsistent with level. Use unique IDs derived from scenario/seed/entity index; baseline golden hash covers canonical tables excluding wall-clock/log fields.

Generate gold and XP via replayed bounded historical reward sessions, not arbitrary “production grant” endpoints. Let preexisting characters have several past sessions to support legal upgraded gear. Include idle citizens, unpledged citizens, empty slots, max-upgrade examples and current Lords. Scores reconcile with authored historical matches; no fabricated wins unbacked by records. The 600 citizens are not 600 active concurrent Twitch viewers.

Ambient Simulation scheduler uses a separate seeded RNG/clock to enqueue canonical commands, one per synthetic actor cooldown, with realistic sparse activity. Pause/speed controls affect Simulation only. Freeze ambient traffic for reproducible camera scenarios; animate only the scripted input timeline. The generator makes zero Twitch or paid model calls.

## Scenario catalog

| ID | Setup and script | Measurable expected behavior |
| --- | --- | --- |
| `baseline-600` | Three faction populations, seven territories, lawful gear/history, no open chapter | Counts total 600, ownership valid, all names synthetic, repeat generation hash identical |
| `first-citizen` | Empty synthetic realm; persona joins, class, profile, pledge | One durable character, same command rules as Live |
| `border-clash` | North owns center; East attacks center with frozen legal roster; North votes Attack, East Defend | Advantage is explained; exact seed/output fixture frozen after engine implementation; only actual winning attacker transfers center |
| `comeback` | Lower-power side gets winning tactic; tune fixed roster/seed through engine before recording | Demonstrates choice effect with genuine calculation, no manually forced winner |
| `perfect-draw` | Explicit unit fixture with equal resulting scores | Draw, retained territory and participation rewards once; separate edge demo, not disguised ordinary RNG outcome |
| `election-quorum` | Eligible synthetic members and two self-nominated candidates; sufficient ballots | One Lord, term persisted, same recognition across all surfaces |
| `election-no-quorum` | Few valid ballots | No invented winner; vacancy/incumbent rules apply |
| `upgrade` | Selected character has gold for exactly one next upgrade | Cost/stat/balance consistent; concurrent second request fails |
| `recovery` | Duplicate message/job, simulated disconnect and restart | No duplicated membership/reward, visible connection status, snapshot recovery |
| `season-close` | Clock just before end, finalized history | One awards set, lifetime gear retained, seasonal map reset |
| `two-channels` | Stretch only: two real authorized broadcasters on one host | Both accept terms; separately scoped roster/commands; one rivalry result |

Do not preclaim specific seeded scores before computing them with the implemented ruleset. Each final scenario manifest records ordered commands, clock advances, initial canonical hash, battle input/output hashes, expected ownership/rewards and screenshot anchors. A developer may select an illustrative seed honestly; a streamer cannot override a Live outcome. Cross-channel simulated scenario stays visibly synthetic and never satisfies two-real-channel proof.

## Suggested script (target 2:55)

| Time | Camera/action | Evidence / spoken point |
| --- | --- | --- |
| 0:00–0:20 | Streamer playing with a quiet corner overlay; one campaign invitation | “ChatVerse gives chat a shared kingdom while I keep playing.” |
| 0:20–0:55 | LIVE badge and consenting account types real `!join`; dashboard citizen appears, then profile/pledge | Show actual Twitch → local backend → persisted citizen; no credentials/codes visible |
| 0:55–1:10 | Streamer launches chapter preset, returns to game; optional pause/quiet toggle | Show low attention cost, no automatic claims about game kills |
| 1:10–1:20 | Explicit transition title “Simulation — 600 synthetic citizens” | Explain scale preview honestly; no transition implying fake users are real |
| 1:20–1:55 | Seeded map and character → vote → three-round battle → same overlay result | One shared calculation changes a contested banner and records history |
| 1:55–2:20 | Character rewards, upgrade, Lord election and ranking | Persistent progression and community recognition; quick overlays, not four unrelated UIs |
| 2:20–2:40 | Chronicle and AI/template provenance; optionally disable AI and produce a safe recap | Narration reflects actual choices, engine remains deterministic |
| 2:40–2:50 | Brief Codex build footage: prompt, engine change and passing relevant test | Show how Codex contributed, with secrets hidden; preserve this footage during implementation |
| 2:50–2:55 | Restart/replay proof and streamer returns to game | Persistence and why a streamer keeps it installed; use earlier shots for real rivalry only if M7 passed |

If video time is shorter, prioritize real join → chapter → outcome → persistent character over listing features. If M7 is absent, do not include a fake cross-streamer war in the ending. Title it a future direction verbally if needed. If Live unavailable, label that limitation clearly; Simulation cannot fulfill the real-integration requirement.

## Live rehearsal runbook

1. Confirm owner-authorized test channel and any participating account consents. Check actual scopes and token validation privately before capture; no tools should send messages to others without explicit implementation-test authorization.
2. Start supported local build, verify Live and Simulation DB identities and backups, correct port, no ambient fake Live traffic. Open dashboard/OBS overlay with mode correct.
3. Test one real chat command, inspect message receipt/identity in redacted trace, confirm persisted state and safe reply. Show latency measured from receipt separately from Twitch transit.
4. Add OBS source, verify alpha over bright/dark footage, safe corners, readable text and reconnect behavior. Disable desktop popups, secret fields and URL-bar capture.
5. Load deterministic Simulation scenario, freeze ambient noise, confirm hashes and persona. Record a continuous proof segment before edited promotional footage.
6. Run chapter and replay, show ledger/reward once, restart app and re-open profile. Disable model adapter and repeat one event with templates.
7. Review final video for synthetic labeling, false feature claims, license issues, inadvertent secrets and audible private information.

## Submission package and judging claims

Prepare a concise product description, video, repository/readme, local setup instructions and `.env.example` without secrets, license/asset credits, supported runtime, exact demo command list, optional AI setup, current limitations and test evidence. The [official resources](https://twitchcon-codex.devpost.com/resources) explain repository visibility/access and session-ID submission; check the actual entry form before sending. Capture the build thread's session ID during implementation. Package no DB with real tokens or private participant records. Provide Simulation startup that requires no Twitch/AI credentials, and explain that real Live verification requires the user's own authorization. Keep judge access free and usable; no mandatory paid AI key.

Claims must map to proof: real integration → recorded actual command; persistence → restart; deterministic battle → matching hashes/replay; AI resilience → no-key run; streamer usefulness → two-click chapter and quiet mode; visual coherence → same territory/crests/score across UI and overlay. Do not claim hundreds of real users, working game telemetry, public viewer hosting, native Twitch polls, distributed cross-channel warfare or a completed live AI integration unless actually shipped and verified.
## Living atlas demonstration

On **World map**, show the panorama, locked frontier requirements and growth cards. North starts at 220 citizens. Press **Welcome 25 simulated citizens** twice: at 270, Skyreach is discovered and fortress HP rises from 1,980 to 2,070. The first batch also wins Welcome Wagon for North; show its first-place record and contributor gold ledger. All arrivals are visibly Simulation data. Launch a border chapter, rally simulated citizens, resolve it and replay the frozen health bars. Full rules: [WORLD_EXPANSION.md](WORLD_EXPANSION.md).
