# ChatVerse product specification

Planning baseline: October 26, 2026 (America/New_York). Verified deadline: November 2, 2026, 5:00 PM Eastern / 2:00 PM Pacific ([official schedule](https://twitchcon-codex.devpost.com/details/dates)). This is a proposal for implementation review, not a claim of working functionality. No application code was created during this phase.

## Product promise

**Your chat writes a kingdom's history while you play.** ChatVerse is a persistent, cooperative and competitive community campaign that sits beside a streamer's existing game. Its distinctive unit is a short campaign chapter: join a faction, choose a tactic, see a bounded battle, and receive a durable chronicle entry. A kingdom is a community identity, not a second game the streamer must operate continuously.

The [visual reference](assets/chatverse-reference.png) supplies mood and feature ideas. Its population figures, progress bars, commands, and integration labels are illustrative. The dashboard, map, character card, battle panel, shop, and overlay must use one design system. The architecture and demo-flow panels are explanatory material, not extra application screens.

## Two audiences and their value

| Audience | Motivation | Core loop | Reason to return |
| --- | --- | --- | --- |
| Viewer | Belong, influence a shared outcome, get recognized | `!join north` → choose class → pledge to a chapter → vote → earn XP/gold → upgrade → see chronicle | Persistent character, rotating elected Lord, next chapter |
| Streamer | Make chat feel like a community without abandoning gameplay | Connect → add overlay → start a chapter during a break → return to game → acknowledge result | Automatic recap, predictable quiet controls, recognizable community story |
| Moderator | Run safe events with little ceremony | Monitor queue → pause/cancel a chapter → suppress an announcement | Clear authority, audit trail, no economy editing shortcuts |

Installation earns its cost only if setup is short and routine operation is almost hands-free. Targets: first local setup under ten minutes once prerequisites and Twitch app credentials exist; launch a chapter in two clicks; routine operation under two minutes per hour; never require an in-game kill feed or scene automation.

## Scope and release tiers

| Capability | Hackathon commitment | Later / stretch |
| --- | --- | --- |
| Live integration | One authorized broadcaster, real OAuth, EventSub chat commands, optional chat replies | Separate bot identity and hosted multi-channel service |
| Viewer progression | Three classes, XP, gold, inventory, upgrades through chat; local rich companion | Public authenticated viewer site, account portability |
| World | Three factions in one channel realm; seven authored 2D territories | Procedural maps, diplomacy, alliances |
| Governance | One faction election, fixed term, equal ballots, safe recall | Complex offices, guilds, parliament |
| Battle | Pledge roster, tactic vote, deterministic resolution and replay, territorial consequence | Two separately authorized channels on one host; federated hosts deferred |
| Steward | Structured short narratives, optional model adapter, reliable templates | Voice, long-running agent, autonomous economy |
| Dashboard/OBS | Functional dashboard, map, kingdom, character, shop, battles, chronicle, setup; transparent overlay | Native installer, OBS control plugin |
| Simulation | 600 synthetic citizens; seeded scenarios; visible labels everywhere | Sophisticated population agent behaviors |
| Subscriptions | Optional recognition badge if scope granted; never required | Rich cosmetic rewards after policy review |

Must ship real frontend and backend with durable saves. A static mockup is insufficient. Rich local viewer screens are testable and demonstrable but are not remotely accessible by installing on localhost. Remote viewers have complete command parity for join, class, pledge, vote, profile, equip, upgrade and rankings. No automatic watch-time XP: chat participation is not proof of watching, and lurkers are not enumerated citizens.

## Domain language

An **installation** runs the app. A **realm** belongs to one authorized Twitch channel. Each realm contains North/Frostborn, East/Sunblades, and West/Shadowfell **kingdoms** (factions). A **citizen** is a viewer's membership in one kingdom, with one character per realm. A **Lord** is an elected citizen with ceremonial leadership and a limited proposal right. The **sovereign** is the streamer, an administrative role rather than a player with superior combat stats. Cross-channel wars, if shipped, match two realm expedition teams and do not silently merge their economies.

## Journeys

1. **First viewer:** see overlay invitation; type `!help`, then `!join north`; server trusts Twitch sender ID, creates character and starter gear atomically; concise response names next command. Choose class and pledge without opening a website. Returning `!profile` shows persisted progress after restart.
2. **Returning viewer:** rejoin existing identity automatically; `!pledge` before roster lock; `!vote defend` replaces an earlier vote until deadline; outcome rewards are once-only; `!upgrade starter-sword` spends earned gold atomically. Missing chapter produces a helpful response, not a failed silent action.
3. **Election:** eligible citizen nominates self, fellow citizens vote using `!elect name`; tally and eligibility are inspectable; term expires automatically; removal of an abusive name does not require deleting history.
4. **Streamer onboarding:** choose Simulation or Live; Simulation works without credentials. Live checklist registers app, authorizes account, verifies scopes/connection, copies overlay capability URL, previews a safe test notification. No fake events can enter Live.
5. **Streamer during gameplay:** preset “Border Skirmish” opens pledges and tactic ballots for 60 seconds; dashboard then requires no attention; overlay offers one CTA, a 20-second replay and one result toast. Quiet mode suppresses toasts and chat output while simulation continues. Explicit pause freezes chapter deadlines.
6. **Failure/recovery:** token revoked → Live disconnect warning; viewer commands stop, local committed chapter finishes; repair authorization without losing citizens. Missing events during a connection gap are acknowledged as unavailable; no fabricated backfill.
7. **Optional rivalry:** second broadcaster authorizes on the same installation; both approve a challenge and deadline; disconnect before lock cancels; after lock, committed battle remains reproducible. Two separate computers need a relay/service and are out of scope.

## Success and acceptance

Demonstrate one real viewer command creating a persistent Live character and reaching the overlay within the latency target. Demonstrate a complete simulated election, upgrade, battle, ranking update and chronicle; restart and retain state. All displays identify environment and source. A stranger should understand what to type from one overlay invitation and `!help`. Verify streamer controls can run an entire chapter without navigating away from the overview.

Measure locally, with no third-party analytics dependency: unique opted-in citizens, first-command-to-pledge conversion, valid ballots per chapter, returning citizens per stream session, chapter-launch interaction count, rejected commands, overlay occupancy, and disconnect duration. Show actual sample size; do not claim audience growth or retention causation from a hackathon demo.

## Assumptions to challenge

- A large map is decoration unless choices visibly change its ownership and chronicle. Prioritize one meaningful border over many inert regions.
- Endless XP for chat spam degrades the stream. Reward bounded contributions, not message volume.
- Permanent Lords become exclusionary. Use short terms, equal ballots, visible eligibility and a stewarded recall.
- A local app is not a globally shared MMO. Keep chat complete and explicitly defer remote web access.
- Paid combat strength undermines community competition. Recognition must remain cosmetic.
- A narrator is distinctive only when it explains actual choices and recalls real history. Tie every passage to an authoritative event ID.

## Review decisions and unresolved inputs

Recommended defaults: chat-first viewers, local browser app, three equal factions, optional read-only subscriber recognition, AI text only, internal equal-weight polls, cross-channel stretch. Implementation starts only after the owner reviews this plan in chat.

Genuinely unresolved: owner/team eligibility under the published rules; available daily builder hours; which broadcaster account can authorize and whether it has subscription features; availability of a second consenting channel; whether public viewer web access is a product/demo requirement; AI provider/key/budget and permitted brand assets. These change delivery risk or hosting scope. They do not prevent finishing the plan. If unanswered, plan assumes one builder at roughly six focused hours/day, one consenting channel, no public hosting, no paid AI dependency, and no cross-channel promise. Verified submission requirements are in HACKATHON_DEMO.

## Document map

- [Architecture and APIs](ARCHITECTURE.md)
- [Database](DATABASE.md)
- [Game rules](GAME_SYSTEMS.md)
- [Twitch and OBS](TWITCH_INTEGRATION.md)
- [AI Steward](AI_STEWARD.md)
- [Screens and design system](UI_UX.md)
- [Milestones](IMPLEMENTATION_ROADMAP.md)
- [Tests and release gates](TESTING.md)
- [Seeds and demo](HACKATHON_DEMO.md)
