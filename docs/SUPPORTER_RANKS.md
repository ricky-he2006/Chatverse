# Supporter honors and elected leadership

Implemented October 27, 2026. Schema version 3 adds `supporter_status`; versions 1 and 2 migrate additively on restart. Existing characters, elected Lords, battle inputs and progression remain intact.

| Subscription | Community title | Appearance | Banner |
| --- | --- | --- | --- |
| None | Citizen | Traveler's colors | The Common Hearth |
| Tier 1 | Knight | Jade portrait trim and clothing accents | The Verdant Oath |
| Tier 2 | Baron | Amethyst portrait trim and clothing accents | The Violet Court |
| Tier 3 | Duke | Gilded portrait trim and clothing accents | The Gilded Dawn |

The character honors panel shows all four ranks. Citizen tables, profiles and individual rankings carry a rank badge. Elected Lord is a separate badge and office: no subscription is required to become a candidate or vote. The existing election eligibility, quorum, term and dismissal rules apply equally.

These are cosmetic honors. Supporter rank never enters battle inputs, fortress-health calculations, tactics, XP/gold grants, equipment bonuses, voting weight, challenge qualification or leaderboard sorting. Clothing accents are code-rendered portrait colors, not separately purchasable inventory. Ceremonial banners appear in the honors panel. Changed supporter ranks create a chronicle notice, rendered by the transparent OBS overlay with a brief arrival animation; reduced-motion preferences disable it.

## Twitch verification

Enable `TWITCH_SUBSCRIPTIONS=true`, restart, then authorize or reconnect the broadcaster with optional `channel:read:subscriptions`. Existing tokens without this scope must be reauthorized. In Live Settings, **Sync supporter ranks** triggers an authenticated, CSRF-protected POST. The separate subscriber-count button remains read-only. Twitch permissions and channel eligibility still apply.

The adapter calls [Get Broadcaster Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions), with the token's broadcaster ID and batches of at most 100 opted-in citizen user IDs. Twitch's `1000`, `2000`, `3000` values map to Knight, Baron and Duke. Gift recipients receive the corresponding honor; gifters receive no rank from the gift. Prime is represented by the tier returned by Twitch, rather than a guessed extra rank.

Sync runs after EventSub connects, after a join (automatic attempts limited to once per minute), and every ten minutes while running. Subscription-change EventSub subscriptions are not added by this extension: upgrades and expiries are reconciled by polling or manual refresh. A new join arriving during an in-progress batch may remain unverified until the next refresh.

All batches are validated before one atomic database commit. Matching broadcaster, requested identity, valid tier, boolean gift flag and complete results are required. A successful complete lookup with no subscription establishes tier 0. Network failures, incomplete pagination or malformed responses never downgrade or partially update a batch. An expired subscription becomes Citizen after a successful refresh. Unknown status never claims a verified non-subscription.

Verified status expires after thirty minutes without a successful lookup. Missing subscription permission, explicit disconnect, a different broadcaster or stale data displays **UNVERIFIED**, hides paid styling, and retains Citizen as a basic community title. Cached database rows remain for reconciliation, but grant no gameplay authority. No tier value from a browser or chat display name can grant Live recognition. The app does not import nonparticipating subscribers as game citizens.

## Simulation and verification

Simulation uses deterministic, explicitly labeled fake tiers. The first three demo identities illustrate Duke, Baron and Knight; many other citizens have mixed ranks. Character-panel **Preview rank** buttons persist a simulated rank and emit a simulated notice. This endpoint exists only under `/api/simulation/characters/:id/supporter`; no equivalent Live assignment route exists. Previewing does not alter equipment, XP, gold, stats or elected office.

Automated tests cover tier parsing, gift recognition, upgrades/expiry, unchanged game statistics and rewards, Lord independence, identity/channel validation, incomplete results, batch bounds, atomic failure, freshness, disconnect/scope loss, preview authentication/CSRF/mode isolation, and migration preserving previewed ranks. Adapter verification uses mocked official-shaped Twitch responses. A real-channel authorization and subscription change have not been tested because no broadcaster grant was supplied for this verification.
