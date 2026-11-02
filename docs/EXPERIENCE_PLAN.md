# Streamer, citizen, Lord and system experiences

## Design decisions before implementation

Prioritize the stream, then participation. The owner console opens in **Stream room**, a realm-specific command center. **Backstage** is the secondary system-management experience. The existing atlas and kingdom maps remain consistent with both. No new bitmap asset or separate visual theme is needed: reuse realm artwork, crests, gold accents, typography and character portraits.

The companion at `/play` is a separate application surface with separate, least-privilege sessions. This is more than hiding menu items. Stream room and Backstage are two views of the same local owner's authenticated console; they are not two different administrative accounts.

| Identity                           | Primary screen                 | Allowed actions                                                                      | Excluded                                                                               |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Local owner as streamer            | Stream room for selected realm | Open/pause councils, announce, quiet mode, review Lord proposals, open overlay setup | No impersonation of real Live viewers                                                  |
| Local owner backstage              | System health/settings/atlas   | Existing local administration and Simulation tools                                   | No claim that fictional realms are genuine channels                                    |
| Citizen                            | Personal companion             | Own profile, equipment, XP/gold/ledger, pledge, vote, class, purchases, nominations  | Other wallets, private ballots, settings, event creation, clocks, resets, overlay keys |
| Current elected Lord               | Citizen companion plus council | Own kingdom overview; one chapter proposal per UTC campaign day                      | No automatic battle start, reward minting or weighted votes                            |
| Signed-in viewer without character | Join screen                    | Choose a kingdom and create only their own character                                 | Assigning another identity or role                                                     |

Subscription rank is cosmetic and never grants Lord or administrative permissions. Lord status is checked from current database terms on every request.

## Screen specifications

**Stream room:** compact realm identity/art header, primary next action, current council/timer and participation, quiet toggle, visible announcement and overlay links, public recent history, kingdom pulse and a small proposal inbox. Controls work through existing authoritative APIs. Routine navigation favors the realm, council and chronicle; global configuration moves backstage. Viewer/Lord preview actions are secondary and clearly labeled Simulation.

**Citizen companion:** personal portrait/role/rank header; next progression action; own gold and XP; equipment upgrades; own kingdom and map; current pledge/tactic ballot; challenge races; elections and own ledger. No owner navigation, reset/advance tools, global settings, other people's financial information or private vote counts. Mobile layouts prioritize one useful action before long lists.

**Lord council:** current office/term, kingdom state and eligible adjacent targets. Proposals are persisted and reviewed by the streamer. Acceptance revalidates the target and starts a normal council; dismissal records a public reason. A newly expired or dismissed Lord loses proposal access immediately.

**Backstage:** clear system heading, connection/overlay/AI state, selected realm summary, and links to existing setup, records and world atlas. The old large overview is no longer the default streamer experience.

## Authentication and data contracts

Simulation preview grants are minted only by the authenticated owner for an existing synthetic character in the selected realm. A short-lived, single-use opaque fragment code exchanges for a separate HttpOnly player cookie and CSRF token. It conveys only that persona's companion permissions; no owner cookie is accepted as a player identity. Preview grants are mode/realm bound and expire on restart or timeout.

Live companion sign-in uses a separate Twitch authorization-code flow and callback. State is bound to an initiating browser cookie and the current authorized broadcaster. Token validation must confirm the expected application and user. Only identity is required; viewer tokens are not stored. Sessions expire within the validated token lifetime, capped at one hour. The local-only deployment remains local: this does not publish a public viewer website.

Companion projections are explicit allowlists: full own character and ledger; public kingdom/territory/event summaries; public closed battle results; only the authenticated person's private vote; hidden election tallies until closure. Commands derive actor identity from the server session, never a browser-supplied character ID. Owner and overlay API authorization remain unchanged.

## Milestones and acceptance

1. Persist this plan and implement proposal rules plus the companion permission boundary. Tests must reject forged identities, cross-realm/mode sessions, missing CSRF and non-Lord proposals.
2. Implement identity-bound Live login and owner-issued Simulation preview exchange. Test state replay, session expiry, preview replay and authorization changes with mocked provider responses.
3. Build Stream room and secondary Backstage views, then the separate citizen/Lord companion. Verify all CTAs call working endpoints and no preview grants administrative access.
4. Run the complete regression suite, production build and desktop/mobile browser checks. Keep the requested main app running; use isolated QA data for mutating checks.

Real Twitch login and native OBS remain external preflights until credentials and a consenting channel are available. No deployment or real-channel messaging is authorized by this implementation task.

## Implemented architecture — October 27, 2026

`src/StreamerRoom.tsx` renders Stream room and Backstage inside the authenticated owner shell. `src/Companion.tsx` renders `/play` independently. `src/experiences.css` shares the existing palette, artwork, crests, portraits and typography. Stream room navigation favors maps, kingdoms, battles and chronicle; Backstage retains complete administrative navigation.

The companion polls its authenticated projection every five seconds and refreshes immediately after commands. The owner console retains its existing real-time stream. Polling deliberately separates personal projections from owner/OBS streams without another connection lifecycle. This is a local demo tradeoff, not a claim of production capacity for hundreds of remote companion sessions. Twitch chat remains the remote participation surface for this local installation.

### Route contracts

Every mode-specific route below also takes `?realm=id`.

| Route                                         | Authentication                         | Purpose                                                   |
| --------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `POST /api/:mode/companion/previews`          | Owner + CSRF                           | Single-use preview for an existing synthetic character    |
| `DELETE /api/:mode/companion/previews`        | Owner + CSRF                           | Revoke pending and active previews for this realm         |
| `POST /api/companion/exchange`                | Opaque preview capability              | Exchange code for companion cookie; code consumed once    |
| `GET /api/companion/config?mode=…&realm=…`    | Public                                 | Realm name and sign-in readiness only                     |
| `GET /api/companion/:mode/session`            | Companion cookie if present            | Own session status and CSRF token                         |
| `DELETE /api/companion/:mode/session`         | Companion + CSRF                       | End own companion session                                 |
| `GET /api/companion/:mode/state`              | Companion                              | Explicit personal/public projection                       |
| `GET /api/companion/:mode/ledger`             | Companion                              | Own latest 20 ledger entries                              |
| `POST /api/companion/:mode/commands`          | Companion + CSRF + idempotency key     | Existing command allowlist, server-derived actor          |
| `POST /api/companion/:mode/proposals`         | Companion + CSRF + current Lord office | Suggest a territory                                       |
| `GET /api/:mode/proposals`                    | Owner                                  | Latest 20 council proposals                               |
| `POST /api/:mode/proposals/:id/review`        | Owner + CSRF                           | Accept into normal council, or dismiss with public reason |
| `/auth/viewer/start`, `/auth/viewer/callback` | Twitch OAuth + browser-bound state     | Independent Live viewer identity                          |

Player cookies are HttpOnly, SameSite=Lax, scoped to `/api/companion`, and named by mode/realm. The owner cookie never acts as viewer identity. API/auth responses default to `no-store`; existing streaming responses keep their streaming headers. Host, origin, body, rate and path checks remain. Projections exclude settings, integration credentials, other wallets/inventory and other private ballots. Owner/OBS authorization was not relaxed.

### Persistence and lifecycle

Schema version **4** adds `chapter_proposals`: ID, author character FK, kingdom FK, territory FK, UTC campaign-day key, pending/accepted/dismissed status, public review reason, creation time and accepted chapter FK. `(character_id, session)` is unique; kingdom/time is indexed. Migration is additive for versions 1–3. Each realm keeps its own SQLite proposal history.

Preview grants expire in five minutes. Sessions expire in one hour; Live sessions expire sooner if the validated token does. Sessions/grants are memory-only and vanish on restart. Reset generation changes invalidate sessions. Live sessions bind to the authorized broadcaster. Backstage can revoke Simulation previews. Subscriber honors remain cosmetic; current database office determines Lord powers on each request.

Acceptance and chapter creation share one transaction. Normal adjacency, capital, rested-territory and active-chapter checks still apply at acceptance. Losing office blocks pending proposal acceptance and further submissions. Dismissal needs a public reason of at least five characters. Proposals confer no rewards or weighted votes.

### Setup and verification

Register **both** Twitch callback URLs: the existing broadcaster callback and `http://localhost:3000/auth/viewer/callback`. Configure `TWITCH_VIEWER_REDIRECT_URI` if changing the latter. Viewer sign-in requests identity without subscription/chat scopes, exchanges the code server-side, validates application/user/login/expiry, then discards provider tokens. See Twitch's [authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow) and [validation requirements](https://dev.twitch.tv/docs/authentication/validate-tokens/). The application session never outlives one hour and keeps no long-lived viewer OAuth token or refresh loop.

Verified with a production build, TypeScript checks and **66 passing tests**. New coverage includes projection privacy, owner denial, forged persona/CSRF rejection, mode binding, preview replay/expiry/revocation, reset invalidation, elected-office checks, daily proposals, owner review, OAuth application mismatch, browser nonce, state replay, broadcaster binding and offline Live command rejection. Provider responses were mocked; genuine consent/EventSub still need credentials.

Browser checks used separate QA data on port 3001: citizen upgrade, Lord proposal, streamer acceptance, citizen pledge, sealed ballot, desktop and 390px mobile layouts without document overflow. The main application stays on port 3000 with its saved worlds. The localhost companion is not remotely accessible to a Twitch audience; a hosted identity-aware gateway or Twitch Extension remains a deployment decision requiring its own design and verification.
