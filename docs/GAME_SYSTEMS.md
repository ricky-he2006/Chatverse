# Deterministic game systems v1

All numbers below are proposed tuning defaults. Freeze `ruleset=chatverse-v1` for the demo and store its content hash with every battle. These rules apply identically in Live and Simulation. No AI or subscription tier may change them.

## Realm, membership and hierarchy

One character per Twitch user per channel realm; one active North/East/West membership. Joining is explicit and free, grants level 1 and starter gear. Display names are cosmetic; Twitch sender IDs establish identity. A kingdom switch is allowed after a 24-hour cooldown, only outside an active chapter/election participation lock; it clears unserved candidacy, not XP/equipment. One citizen's character cannot be counted twice in a battle.

Streamer sovereign and delegated application moderators operate chapters and safety controls. Citizens pledge, vote and progress. Each kingdom has one elected Lord for a seven-day term, with banner recognition and one suggested chapter proposal per stream session; streamer accepts or dismisses it. Lord status grants no power bonus, vote multiplier, API access or gold minting. Banned citizens are suspended from future participation; already frozen battle inputs remain immutable.

## Progression and economy

Level L is the largest integer 1..20 where total XP >= `50*(L-1)*L`. Thus thresholds are 0,100,300,600,1000; level 20 is 19,000. Next-level progress uses total XP minus current threshold, never mixes lifetime and per-level bars. Level 20 retains excess XP for lifetime display but no further combat growth. Season score is separate.

| Reward | XP | Gold | Limits |
| --- | ---: | ---: | --- |
| First valid participation action per stream session | 10 | 10 | Once, session at least 30 min apart if manually restarted |
| Battle pledge fulfilled, any outcome | 20 | 20 | First three resolved battles/session |
| Winning battle participation | +10 | +10 | Same three-battle reward cap |
| Valid election ballot at final tally | 5 | 5 | Once per election, one rewarded election per seven days |

Hard cap per user per stream session: 100 XP, 100 gold, inclusive of all rewards. A “session” is a persisted stream window, not a browser refresh; keep reward caps across manual restarts within 30 minutes. No XP per ordinary message, paid subscription, bits or unverified watch time. Repeat commands and changed votes earn nothing. Cancelled chapters award nothing. Players outside the capped combat roster still earn one pledge participation reward if their pledge was valid at lock, preventing exclusion by random roster selection.

Economy has no trading, real-money value, wagering or consumable stat boosts. Starter weapon grants +4 ATK, armor +3 DEF, charm +10 HP; each occupies weapon/armor/charm slot. Shop offers alternative weapon styles (blade, bow, dagger) with identical base power and no class restriction in v1; art communicates identity without a hidden best class. One copy per item definition per character in v1; purchase price 60 gold. Upgrade gear from k to k+1 for `30*(k+1)^2` gold, k=0..4. Max +5. Weapon gains +2 ATK/upgrade, armor +2 DEF/upgrade, charm +5 HP/upgrade. Stats are additive; no randomized rarity or percentage stacking. Costs shown before confirmation; insufficient funds or stale item version fails atomically without a debit.

Class changes are free before first battle, then once per stream session outside a locked chapter. Gear stays equipped because v1 gear has no class restrictions. Future class-restricted items require explicit unequip rules before release.

## Classes and effective stats

| Class | ATK / level growth | DEF / growth | HP / growth | SPD / growth | Identity |
| --- | --- | --- | --- | --- | --- |
| Vanguard | 14 / 2 | 12 / 2 | 100 / 5 | 8 / 1 | Sturdy front line |
| Ranger | 16 / 2 | 8 / 2 | 90 / 5 | 11 / 1 | Balanced scout |
| Rogue | 16 / 2 | 6 / 2 | 80 / 5 | 15 / 1 | Swift striker |

Effective stat = base + growth*(L-1) + equipped item bonuses. Combat intentionally uses one transparent strength scalar in v1 rather than pretending to simulate individual tactical movement: `power = 4*ATK + 3*DEF + floor(HP/5) + 2*SPD`. Each class starts at power 128 before gear and grows by 17 per level. They are flavor/stat sidegrades in v1, with no hidden class-specific abilities; meaningful tactical decisions come from the faction ballot. Test equal composite power at every level and with identical gear. Class counters or individual skills require a future ruleset, not untested advantages in this demo.

## Chapter and roster state machine

`DRAFT → OPEN → LOCKED → RESOLVED → ARCHIVED`, with `OPEN ↔ PAUSED`, and DRAFT/OPEN/PAUSED → CANCELLED. No arbitrary “End Battle” winner button. Cancel after resolution is impossible; admin corrections are new audited records. OPEN defaults to 60 seconds of pledges and tactic voting, configurable 30..180 seconds. PAUSED freezes remaining time. A battle is resolved at lock and presented over 20 seconds; cancelling a replay cannot revoke rewards.

Each faction's valid pledged citizens are sorted by stable character ID. At lock choose at most 50 combatants per side by SHA-256 rank of `chapterSeed|characterId`, tie by ID. Generate the chapter seed cryptographically on the server, store it privately and reveal it with the frozen replay after lock; do not expose it during pledging. Both sides need at least one pledge; otherwise cancel with “not enough citizens.” Membership and stats freeze at lock. Equipment upgrades afterwards affect only future chapters. Power uses `floor(sum(power)/N)` plus a participation bonus `min(1000,50*N)` basis points, so enormous channels do not win by population alone. Set team effective power `floor(meanPower*(10000+bonus)/10000)`. This rewards participation modestly, caps at 20 combatants' bonus and keeps smaller communities viable. Disclose capped-roster selection. In this formula N is selected combatants, not all pledged citizens; reward eligibility still includes all valid pledges.

## Tactics, voting and battle computation

Each pledged participant gets one replaceable ballot on their own side: Attack, Defend, Raid. Ballots close strictly at server `now >= deadline`. Tally votes at lock. Highest count wins; tie or zero votes defaults to Defend. Vote weight always one. A newly pledged citizen can vote until lock; voter eligibility and pledge insertion are transactional. UI labels side-specific results to avoid implying one shared tactic for both armies.

Tactic relationship: Attack beats Raid, Raid beats Defend, Defend beats Attack. Advantage multiplies favored side by 11000 basis points and other side by 10000; equal tactics both 10000. No secret Lord bonus. Defending an owned border adds 300 basis points to the defender before the tactic multiplier. Capitals are ineligible targets.

Pure function input: sorted frozen rosters, side counts/mean powers, selected tactics, terrain/ownership flag, seed uint32, ruleset hash. Randomness is xorshift32: apply xor-left13, xor-unsigned-right17, xor-left5 with uint32 truncation after each operation; seed zero is remapped to `0x6d2b79f5`. The generator and hash ordering are specified identically for all platforms. Never use Math.random, locale sort, wall clock or floating point bonuses inside resolution.

Run three rounds, draw A then B roll per round as `9500 + (nextUint32() % 1001)`. Tiny modulo bias is accepted/documented for this non-monetary game. For each side, `adjusted = floor(floor(effectivePower*terrainBP/10000)*tacticBP/10000)` then `roundScore = floor(adjusted*rollBP/10000)`. Total score is sum of three rounds. Higher total wins; equal total is a draw. No HP death loop or speed turn order is claimed; HP/SPD contribute to power. Bound all input stats and team sizes so Number-safe-integer limits cannot be approached. Save all six rolls and scores.

Worked neutral example: each side effective power 200, identical tactics, rolls A=10000 each and B=9500 each → totals A=600, B=570; A wins. Tactic example: effective power 200, neutral terrain; Attack versus Raid → adjusted 220 versus 200 before rolls. Unit tests also cover flooring order, zero seed, exact draw and roster-order invariance. Golden replay outputs must be generated and manually reviewed during implementation; this document does not invent seed-specific results.

UI shows “campaign score,” not troop health or live game kills. Score share = side total / combined total for display only; a pre-resolution bar uses clearly labeled projected power, never a fabricated probability. Twenty-second battle animation is an ordered presentation of the stored three rounds.

## Territory

Seven territories: three noncapturable capitals and four contested border nodes. Symmetric fixed graph: each capital connects to one near border, near borders connect to center, and center connects the remaining near border. Exact IDs: capitals `northhold/eastkeep/westspire`; borders `frostpass/sunreach/shadegrove/crossroads`; edges northhold-frostpass, eastkeep-sunreach, westspire-shadegrove, frostpass-crossroads, sunreach-crossroads, shadegrove-crossroads. Initial ownership: each faction owns its capital and near border; crossroads neutral. A neutral expedition uses a scripted neutral defender in Simulation only; Live v1 battles target an enemy-owned adjacent near border or crossroads. To avoid an initial no-target deadlock, the streamer must first assign crossroads to a faction at season initialization (default North), audited as setup, and the other factions may challenge that adjacent center. Attacker must own an adjacent node; target cannot be capital.

Attacker win transfers contested target. Defender win or draw retains ownership. No permanent loss of character/equipment; no negative gold. A territory is attackable at most once per stream session to prevent farming. If a faction loses its near border its capital still connects to that border, so comeback remains possible. Cross-channel stretch awards a rivalry trophy rather than transferring one channel's local territory; terms are approved by both streamers.

## Elections

Self-nominations last 60 seconds; voting lasts 90 seconds in demo preset, five minutes in normal preset. Eligible voter/candidate: active membership at opening, level >=2, not suspended. Eligibility snapshots at election opening; no last-second faction switching. At least two eligible voters and one candidate are required; quorum `max(2,ceil(eligibleCount*0.10))`. One ballot per citizen, replaceable until deadline. Candidate highest tally wins; tie breaks by earlier membership join timestamp, then stable character ID. Below quorum or no candidate leaves incumbent until term expiry, then vacant; do not appoint an AI invented Lord. Candidate may vote for self.

Streamer can dismiss a Lord for safety with visible reason and audit record; next election fills vacancy. A public citizen recall petition is deferred; v1 “recall” is streamer removal, not an unimplemented voting system. Lord term seven days; one consecutive re-election allowed, then one term ineligible. Simulation can advance clock through terms using the injected clock; Live clocks cannot be manipulated by demo controls.

## Seasons and rankings

Seven-day seasons with explicit UTC boundaries displayed in local time. Kingdom gains 3 points for win, 1 for draw, plus 2 per contested territory held at season close; losing gains zero. Limit scoring to first three battles between the same faction pair per stream session. Individual contribution: +1 valid battle pledge (first three/session), +1 finalized election ballot (one/week), +1 winning participation. Rank individuals by contribution, then participation count, then stable ID; kingdoms by points, wins, then stable ID. Show ties as tied rank before display ordering, avoiding false competitive distinctions from ID. No subscriber weighting or raw audience ranking.

Season close transaction finalizes awards, cancels open uncommitted chapters, resets territories and seasonal score projections, opens next season; lifetime characters and gear remain. Ranked cross-channel ladders are deferred because collusion and channel size require more testing. Manual admin grants are absent from Live; reproducible accelerated scenarios exist exclusively in Simulation.
## Implemented extension: living atlas

The current build adds population milestones, persistent outposts, fortress-health combat version 2 and daily first-completion races. [WORLD_EXPANSION.md](WORLD_EXPANSION.md) specifies the shipped rules and supersedes older score-only battle descriptions for new battles. Version 1 stored battles retain their original rules.
