# Twitch and OBS integration plan

Research reviewed October 26, 2026, using official Twitch and OBS documentation linked below. Requirements can change; M0/M1 must recheck actual app type, granted scopes and live payloads. This plan does not imply a registered app, verified bot, existing authorization or completed integration.

## Chosen topology

Use the installed-chatbot pattern: broadcaster authorizes a local backend, which receives EventSub over an outbound WebSocket. Core read scope is `user:read:chat`; optional sending adds `user:write:chat`. WebSocket subscriptions use a user access token. A hosted bot has different grant requirements and is deferred ([Twitch authentication patterns](https://dev.twitch.tv/docs/chat/authenticating)).

Live v1 sends as the broadcaster account, clearly previewed during onboarding. No separate bot badge is promised. Separate bot identity can improve presentation later but adds a second account consent and privilege matrix. Do not request cloud-only bot scopes speculatively.

## Registration and OAuth

Twitch app registration requires a developer account with 2FA and configured redirect URLs ([registration](https://dev.twitch.tv/docs/authentication/register-app/)). For the development-owned local installation, propose confidential authorization-code flow: server exchanges code with client secret, receives access/refresh tokens, and uses a registered redirect URI. Twitch documents localhost callbacks ([OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)). Register exactly `http://localhost:3000/auth/twitch/callback`; fail clearly if port is unavailable rather than silently changing the callback.

Implementation controls: generate single-use 256-bit state, bind to initiating local session, purpose and expected account, expire in ten minutes, constant-time compare; reject replay/missing state and callback errors; validate returned subject/scopes before declaring connected. Redirect away from query-bearing callback immediately; redact codes from access logs. Use HttpOnly SameSite=Lax local session cookies; HTTPS secure cookies required for future hosted deployment. Never put tokens in localStorage, frontend environment variables, overlay URLs or exported debug bundles.

This is a developer-operated installation: owner supplies their own app credentials to the backend vault. A client secret bundled into a public desktop binary is not confidential. For public distribution, choose Twitch's supported public-client device flow or move confidential token exchange to a hosted service after a new threat review; do not distribute this local developer setup as a secure mass-market installer.

Validate OAuth tokens at startup and hourly, and terminate associated sessions on invalid authorization ([validation](https://dev.twitch.tv/docs/authentication/validate-tokens/)). Handle 401 with one serialized refresh attempt, replace stored rotated tokens atomically, retry only safe requests, and require reconnect when refresh fails. Twitch documents authorization-code refresh tokens and reactive refresh ([refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/)). Distinguish expired token from revoked grant; no endless refresh loops.

## Capability matrix

| Feature | API/event and token identity | Scope | Delivery plan |
| --- | --- | --- | --- |
| Chat commands | `channel.chat.message` v1; condition `broadcaster_user_id=channel`, `user_id=authorized broadcaster` | `user:read:chat` | Required; parse only verified sender identity |
| Command replies / Steward text | `POST /helix/chat/messages`; sender is token user | `user:write:chat` | Optional at authorization; enable for viewer feedback demo |
| Subscriber recognition | `GET /helix/subscriptions`, broadcaster ID matches token subject | `channel:read:subscriptions` | Optional reconciliation, never a participation gate |
| Subscription changes | `channel.subscribe`, `channel.subscription.end`, `channel.subscription.message`, `channel.subscription.gift` v1 | `channel:read:subscriptions` | Stretch cosmetic notifications; do not sum gifts into unique users |
| Stream status | `stream.online` / `stream.offline` v1 and Get Streams | No extra scope for these public resources, proper token still required | Nice-to-have; manual session start/stop is core |
| Native Twitch polls | Poll APIs/events | Separate poll permissions | Deferred; use internal chat ballots |
| Channel Points | Reward/redemption APIs/events | Separate reward permissions | Deferred; no dependency on account eligibility |
| Highlighted announcements | Chat Announcement API | Separate moderator permission | Deferred; ordinary chat messages suffice |

Chat subscription authorization is defined by [EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/). Subscription events have different meanings: subscribe excludes resubscribes; end updates expiry; message is a resub message; gift may be anonymous. Treat unknown/anonymous recipients as unknown, not new player identities. Broadcaster subscriber lookup is paginated and scope-restricted; chat sending uses `user:write:chat`, and native polls have separate requirements ([API reference](https://dev.twitch.tv/docs/api/reference/)). A subscriber list is not the current audience. Missing permission/eligibility displays “unavailable,” not zero subscribers. Core experience must work without subscription features.

## EventSub connection lifecycle

Connect `wss://eventsub.wss.twitch.tv/ws`, receive welcome session ID, create subscriptions within the documented default ten-second window. Monitor negotiated keepalive and pong frames. Server-requested reconnect follows its supplied URL, transfers session subscriptions, and closes old connection after successful welcome; unexpected disconnect starts a new session and recreates subscriptions. Twitch provides no replay for missed events. Limits currently include three connections per client/user tuple, 300 subscriptions/connection and total cost 10; begin with one per authorized broadcaster ([WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)).

Proposed adapter state: DISCONNECTED → CONNECTING → SUBSCRIBING → CONNECTED → RECONNECTING; authorization failures → REAUTH_REQUIRED. CONNECTED requires expected subscriptions enabled, not merely an open socket. Use exponential backoff with jitter capped at 30 seconds; operator disconnect prevents reconnect. Handle subscription revocation by disabling that capability. Keep one grant/connection context per broadcaster; cross-channel stretch uses two grants, not one token impersonating two streamers.

Ingress validates schema, subscribed type/version, expected channel and sender IDs; deduplicates metadata ID plus semantic chat message ID. Preserve provider timestamp but adjudicate deadlines by receipt/commit server time: a delayed vote arriving after close is rejected. Do not call a public webhook signature verifier on WebSocket frames. If webhooks are later added, require public HTTPS, challenge and signature verification, replay defense and a separate deployment plan.

## Command grammar and behavior

Case-insensitive ASCII command keyword, whitespace-tokenized argument slugs, bounded 200-character command payload; user display names never parsed as authority. Unknown `!cv` command returns help subject to cooldown. Support namespaced `!cv join north` and short aliases shown below; allow disabling short aliases to avoid collisions with existing bots. Ignore own app-authored outgoing messages by message ID, not every message from the broadcaster, so the streamer may still participate.

| Command | Effect |
| --- | --- |
| `!help` / `!cv help` | Two-line getting-started guide with progression and voting commands |
| `!join north|east|west` | Idempotent join or cooldown-checked switch |
| `!profile`, `!level`, `!stats` | Concise character/XP/equipped stats |
| `!class vanguard|ranger|rogue` | Validated class choice |
| `!kingdom [slug]`, `!leaderboard` | Safe summary and top three standings |
| `!pledge` | Join own faction's current chapter |
| `!vote attack|defend|raid` | Replace own side's tactic ballot |
| `!nominate`, `!elect candidate-slug` | Self-nominate / election vote; unambiguous candidate short ID shown in list |
| `!shop`, `!inventory` | Bounded item IDs and current gold |
| `!buy item-id`, `!equip item-id`, `!upgrade item-id` | Atomic economy/equipment mutation |
| `!battle kingdom` | Proposal only, never immediately starts a war |

Command service is the same as Simulation. Apply per-user cooldown: one mutating command/2 seconds, read summary/10 seconds, plus realm ingress budget and queue capacity. Deduplicated events do not consume rewards twice. A rejected command returns precise reason when response budget allows; no chat response guarantee during overload, dashboard records the rejection. Routine join/vote confirmations may be aggregated to protect chat; interactive profile/upgrade replies take priority.

## Outbound limits and moderation

Twitch documents normal account limits of 20 messages/30 seconds, elevated 100/30 when broadcaster/mod/VIP, plus a one/second/channel restriction for ordinary senders. Limits are shared per sending account and bot verification is not a launch dependency ([chat limits](https://dev.twitch.tv/docs/chat/)). Proposed app budget is deliberately lower: 10 sends/30 seconds/account, at least three seconds between sends/channel, bounded queue 50, routine notices expire after 15 seconds. Respect Helix rate headers/429 reset and independent endpoint budgets ([API rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits)).

On Send Chat Message response inspect `is_sent` and drop reason, including AutoMod; HTTP success alone is insufficient ([chat delivery](https://dev.twitch.tv/docs/chat/send-receive-messages/)). Never bypass moderation, retry blocked text with spelling variations, or claim a held message was delivered. Unknown timeout outcomes are audited and not automatically resent. Streamer quiet mode and master chat-output switch take precedence over all AI jobs. In-world “announcements” are UI entries; highlighted Twitch announcements are explicitly out of scope.

## OBS and local access

OBS Browser Source accepts a web URL, configurable viewport/FPS and transparent page CSS; it may unload or refresh when scenes change ([OBS Browser Source](https://obsproject.com/kb/browser-source)). Proposed setup: 1920×1080 at 30 fps, URL `http://localhost:3000/overlay/live/<realm-id>#key=<capability>`. Overlay JS reads fragment, removes it from visible history, exchanges it for an overlay-only session and uses same-origin snapshot/SSE. Never send a broad admin cookie as overlay authority. Hash keys in DB; rotation/revocation immediate; redact URL fragments in screenshots. Authorize only minimal public projection and prohibit writes. Browser-source page permissions need no OBS control privilege.

Test OBS alpha output over actual game footage; scope widgets to safe corners, never draw an opaque full-screen body. Hidden/refreshed sources reload current snapshot and suppress old toasts. Remote OBS or remote viewer web cannot use this localhost URL; requires intentional host deployment. Do not open router ports, expose admin service with a tunnel, or call a local preview a public companion.

## Verified limitations and integration proof

No planned Twitch event provides arbitrary Valorant/Fortnite kills, round wins or match telemetry. The architecture therefore uses streamer-confirmed “victory/defeat/milestone” signals with actor and provenance labels; a separate game-specific approved integration would require fresh research. Never infer gameplay outcomes from category, chat claims or AI.

M1 must prove real callback, scope validation, real chat event → canonical command → DB row → browser update, then token refresh/reconnect and dedupe. Use Twitch CLI's mock WebSocket server for failure fixtures ([CLI](https://dev.twitch.tv/docs/cli/websocket-event-command/)); mock evidence is labeled Simulation/testing and cannot satisfy the real-integration gate. Subscription proof is optional and separately marked. Hackathon submission requirements were researched separately and are recorded in HACKATHON_DEMO.
## Implemented supporter recognition

Individual subscription-tier cosmetics now use joined-citizen lookups, ten-minute reconciliation and a manual sync action. The shipped adapter does not subscribe to subscription-change EventSub topics; changes appear after reconciliation. See [SUPPORTER_RANKS.md](SUPPORTER_RANKS.md) for scope setup, caching, identity validation and verified versus simulated status.
