# Living atlas and realm races

Implemented October 27, 2026. Restart the local server after updating so the additive schema migration and new APIs load. Existing characters, gear, rewards, ownership and stored battles remain intact.

## Illustrated atlas

The existing Everfall panorama is the map backdrop. North occupies the snowy left, East the golden center, and West the violet right. Selectable, keyboard-accessible settlements and route lines show authoritative ownership. A territory list provides the same selection interaction. Zoom and horizontal scrolling support smaller displays. Locked frontiers show their population requirements; they cannot be targeted or traversed in battles.

Seven original regions plus four discoverable outposts per kingdom give nineteen possible regions. Existing demo populations begin with two outposts per faction unlocked: thirteen visible, functional territories. The artwork is a fixed panorama; expansion reveals settlements within it rather than generating infinite geography.

## Population and combat

Only joined character identities count. This is not Twitch concurrent viewers, subscriptions or raw chat volume. Each kingdom retains its highest simultaneous citizen count. Switching banners cannot repeatedly unlock the same milestone. Discoveries persist when citizens leave, across server restarts, and across seasons; seasonal ownership returns to each outpost's original faction.

| Citizen high-water mark | Discovered outposts | Fortress HP | Bonus |
| --- | --- | --- | --- |
| 0–24 | 0 | 1,800 | 0% |
| 25–99 | 1 | 1,890 | 5% |
| 100–249 | 2 | 1,980 | 10% |
| 250–499 | 3 | 2,070 | 15% |
| 500+ | 4 | 2,160 | 20% |

New battles use `chatverse-v2`. Population, health bonus, maximum HP, roster and tactics are frozen when the council locks. The existing seeded damage rolls, tactic advantage and defending terrain bonus remain. Both sides deal damage simultaneously for up to three rounds; defeated armies deal no damage in later rounds. Damage cannot exceed remaining opponent HP. Highest remaining health **percentage** wins, using exact integer cross multiplication; equal percentages draw. This supplies modest protection without rewarding a large kingdom simply for starting with more raw HP. Characters retain their personal stats and equipment.

`chatverse-v1` inputs use the unchanged resolver, preserving old hashes and replays. V2 replays show remaining health and round damage; the OBS result displays HP.

Population counts are not Sybil protection: multiple real Twitch accounts can still join. Before a public competitive launch, evaluate identity age/participation eligibility and challenge cohort sizes. Do not silently apply those restrictions to the hackathon experience.

## Realm-wide races

Everyone in one channel's local realm shares the race board on World map. Live and Simulation have separate databases and winners. These races do not federate across separate installations.

| Race | First finisher | Qualification | Reward ceiling |
| --- | --- | --- | --- |
| Rally the realm | Kingdom | Five distinct citizens make a new valid pledge after opening | 15 XP + 20 gold per winning contributor |
| Firstlight Forge | Citizen | Successfully upgrade each of weapon, armor, charm after opening | 20 XP + 30 gold |
| Welcome Wagon | Kingdom | Ten newly created identities join after opening | 10 XP + 15 gold per winning newcomer |

The board shows leaders, progress, expiry and the permanent winner. Races open together for twenty-four hours. The scheduler starts a fresh wave after the previous wave expires, preserving history. `!challenges` returns open-race progress when Twitch chat replies are enabled. Existing `!join`, `!pledge`, and `!upgrade` commands drive participation.

No historical seed actions count. Duplicate receipts, repeat joins, failed upgrades, repeated upgrades in one slot and repeat pledges do not count. Kingdom credit uses allegiance at contribution time. Only contributors recorded for the winning kingdom receive rewards. SQLite transactions select one winner, award rewards and record the event together. The existing per-character, per-source reward key prevents duplicate payouts. Existing daily ceilings of 100 XP and 100 gold apply, so actual payouts can be below advertised ceilings. The winner record remains even if the daily reward ceiling is exhausted.

Simulation-only “Welcome 25 simulated citizens” buttons create real synthetic characters through the same command engine. Requests require dashboard authentication and CSRF, are bounded to fifty arrivals, and are replay-safe by batch UUID. The existing “Rally simulated citizens” control also contributes only newly inserted pledges. No equivalent arrival endpoint exists for Live.

## Persistence and verification

Schema version 2 adds `kingdom_growth`, `challenges`, `challenge_progress`, and `challenge_contributions`. V1 databases migrate additively; future unknown versions fail closed. Progress is processed inside authoritative command transactions; read snapshots never award rewards. SSE invalidation updates dashboard and overlay from committed state.

Tests cover exact growth boundaries, the health cap, persistent discoveries, conquest preservation, locked targets, first-winner payouts, repeat-action prevention, deadline exclusion, Live/Simulation isolation, HTTP bounds/authentication, restart migration, daily renewal, frozen v2 health and deterministic replay. Existing v1 golden fixtures remain part of the suite.
