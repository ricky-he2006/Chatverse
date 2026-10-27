# Streamer realms and the world atlas

Implemented: local multi-realm Simulation and a two-level map. This is the first stage of the connected-world design; shared Live coordination and cross-streamer battles are not implemented by this change.

## Product structure

The world atlas, **The Shattered Reaches**, shows streamer realms. Select a banner to inspect its kingdoms and discoveries; enter the realm to use its detailed map and all existing gameplay screens. The sidebar's realm selector opens the atlas. The local **Realm map** links back to it.

Each streamer realm contains its own North, East and West kingdoms. A kingdom has its own Lord, citizens, capital and frontiers. A realm owns its characters, inventory, gold, XP, elections, battle records, season standings, challenge races and settings. Nothing transfers automatically between realms.

The atlas includes search by realm/creator, name/population sorting, population totals, kingdom counts, frontier progress, current-council status and realm inspection. Distinct sigils, colors, landscape crops and map treatments keep the four communities recognizable while sharing the existing visual system. Larger discovery counts modestly expand the atlas land outlines; these are a capped visual representation, not territory gained over another realm.

## Simulation communities

| Realm ID | Realm | Fictional creator | Theme | Initial citizens |
| --- | --- | --- | --- | --- |
| home | The Everfall Realm | @EverfallHost | Frost | Existing world, normally 600 |
| emberwatch | Emberwatch Dominion | @EmberPilot | Ember | 720 |
| moonharbor | Moonharbor Court | @LunarArchivist | Moon | 660 |
| stormgarden | Stormgarden Reach | @MossAndThunder | Verdant | 810 |

All creators and citizens above are clearly labeled fictional. Additional citizens are created once through the authoritative Simulation command engine. Their rewards, challenges and discoveries are real simulated state. Existing home-world data is preserved; the first row's actual count reflects any changes already made by the operator.

This release has a fixed, tested set of demo realms. It does not offer arbitrary realm creation, real streamer discovery, invitations, alliances, trade or realm-versus-realm combat.

## Persistence and authority

The local `RealmRegistry` selects one `World` instance and SQLite file per realm:

| Data | File under `CHATVERSE_DATA_DIR` |
| --- | --- |
| Existing Simulation home | `simulation.sqlite` |
| Authorized Live channel | `live.sqlite` |
| Additional Simulation realm | `simulation-<known-realm-id>.sqlite` |

Only whitelisted realm IDs resolve to files. Each database is bound to its realm by the `realmIdentity` setting; opening a bound database as a different realm fails. Existing unbound home data is bound to `home` on startup. This adds settings metadata without changing schema version 3. Restore a realm backup to its own database filename.

Additional worlds open lazily. The running server advances all opened worlds and their independent narrative workers. Each world retains the same authoritative game engine and rules. Scenario reset clears only its selected Simulation world, retains realm identity, and does not recreate the initial extra citizens on the next restart. The installation lock still covers the whole data directory; do not run two processes against it.

AI settings and provider budgets are per realm. No new model calls are enabled automatically. Twitch integration remains attached only to `live.sqlite`.

## API and frontend synchronization

Existing endpoints remain compatible. An omitted realm selects `home`; a `realm` query parameter selects a known realm:

```text
GET  /api/simulation/atlas?realm=home
GET  /api/simulation/snapshot?realm=emberwatch
GET  /api/simulation/events?realm=emberwatch
POST /api/simulation/commands?realm=emberwatch
POST /api/simulation/scenarios/load?realm=emberwatch
POST /api/simulation/overlay/keys?realm=emberwatch
```

The atlas endpoint returns small realm summaries, not full character inventories or private votes. Realm selection affects reads, commands, scenario loads, time advancement, synthetic arrivals, elections, equipment/rank previews, backups and overlay operations. Unknown IDs are rejected. A non-home Live realm is rejected for realm operations.

Frontend URLs include mode, realm and screen. Selected personas are stored separately per mode/realm; old home-persona preferences remain readable. Switching realms clears the old character, selected battle, modal and territory context before loading the destination. Requests explicitly capture their realm; there is no mutable global request target. Stale responses cannot overwrite a newer mode/realm selection. The atlas refreshes with active-world snapshots and can be refreshed manually; it is not a globally distributed real-time service.

## OBS isolation

Generated URLs carry the selected realm:

```text
/overlay/simulation?realm=emberwatch#key=<private-capability>
```

Key exchange binds the session to both mode and realm. Additional realms use separate HttpOnly overlay cookies, and key checks read only the selected database. A key cannot be exchanged for another realm, a renamed cookie cannot bypass its realm binding, and revoking Emberwatch's key does not revoke Moonharbor's. Home overlay URLs and cookie names remain backward compatible. The overlay preserves its realm query when removing the secret hash and identifies the realm in its campaign header.

## Live boundary and subsequent stages

Live atlas currently shows only the authorized channel's own realm. Demo neighbors never appear as genuine Twitch communities. The other simulated realms cannot be selected as Live worlds, and no additional OAuth grants are requested.

A shared Live world still needs an explicitly designed coordination boundary: verified channel ownership, a privacy-limited realm directory, opt-in snapshot publication, freshness/disconnection behavior and authoritative agreements for any cross-realm battle. The local registry is a foundation for those contracts, not a substitute for them. No federation service is deployed and there is no arbitrary remote snapshot-import endpoint.

## Verification and demo

Six new realm tests cover independent databases and progression, binding mismatch rejection, restart/reset behavior, scoped HTTP commands and clocks, isolated battle history, atlas population summaries, Live separation, and realm-bound overlay cookies/key revocation. The complete suite is **62 passing tests**; TypeScript and the production build pass.

Browser checks: inspect Emberwatch on the atlas, enter it, welcome fifty citizens, and return to observe 770 Emberwatch citizens while home remains 600. Search for LunarArchivist, enter Moonharbor, switch to Live and verify the empty authorized home remains separate. Reopening the current realm keeps the map functional.

Responsive checks at 390 × 844 showed no document overflow for either atlas or local realm map (375-pixel document within the 390-pixel viewport). The world map scrolls inside its own container; realm cards provide a second navigation route. No browser console errors were observed. The running application was opened and unlocked on port 3000 at the owner's request; QA used a separate port/data directory.

For a fresh demo, start ChatVerse and open **World atlas**. Click any banner, review its kingdoms, and choose **Enter realm**. Use **Back to world atlas** to compare communities. Restart the server after updating so the realm registry and scoped routes are loaded.
