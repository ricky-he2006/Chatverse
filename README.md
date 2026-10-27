# ChatVerse

The living atlas now reveals new outposts as kingdoms grow, with capped fortress health and daily first-completion community challenges. See [world expansion and race rules](docs/WORLD_EXPANSION.md). Restart the local server after updating to apply the additive migration.

**Your stream. Their kingdom.** A local-first Twitch community campaign: citizens join factions, develop persistent characters, choose battle tactics, elect Lords and write a shared chronicle while the streamer plays their normal game.

This repository now contains a working frontend, backend, game engine and populated Simulation. Real Twitch OAuth/EventSub code is included; a real-channel authorization test still requires the owner's credentials. See [build status](docs/BUILD_STATUS.md) for the precise verified scope and remaining work.

## Run locally

Requires **Node.js 24 LTS** and a complete dependency install. No Twitch or AI credentials are required for Simulation.

```powershell
pnpm install
pnpm build
pnpm start
```

Open [ChatVerse](http://localhost:3000). Enter the private local unlock code printed in the server terminal. Keep that terminal running; Ctrl+C stops the application. Sessions and the code reset when the server restarts, but characters and world data persist.

On this Windows machine dependencies are already installed. **Double-click `start-chatverse.cmd`**, or run:

```powershell
.\start.ps1
```

The launchers use Node on PATH, or the existing bundled Codex Node runtime when available. They do not download a runtime. The CMD launcher rebuilds the frontend before starting. For source development, `pnpm dev` starts the backend on 3000 and Vite on [5173](http://localhost:5173). Use one server instance at a time.

## Try the complete Simulation loop

1. Explore **Overview → World map**. All 600 citizens are explicitly synthetic. Initial seasonal standings come from three engine-resolved, replayable synthetic battles.
2. Open **Citizens**, select a character and inspect **Character & gear**. Upgrade equipment with earned gold; inspect the ledger.
3. **Launch a chapter**. The picker offers adjacent enemy borders that have not been contested during the current UTC campaign day.
4. On **Battles**, pledge and vote. **Rally simulated citizens** populates the other ballots. **Advance 65 seconds** closes the council through the same scheduler used by Live.
5. Inspect the result, three-round replay, frozen roster and SHA-256 hashes. The result is already settled; replay never awards twice.
6. Open an election from **Kingdoms**, or load **A crown for the people** through **Explore scenarios**. Advance Simulation time to test closing and quorum.
7. Load **The turning of an age** and advance time to verify season archival. XP and equipment persist.

Scenario loading replaces only Simulation data and requires typing `RESET SIMULATION`. Live has no reset, fake-citizen or accelerated-clock endpoints.

## Connect a real Twitch channel

1. Register your own **confidential developer application** in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Register exactly `http://localhost:3000/auth/twitch/callback` as its redirect URL.
3. Copy `.env.example` to `.env`; set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Restart ChatVerse.
4. Unlock the dashboard at **http://localhost:3000** (use this hostname consistently for OAuth), switch to **Live**, then **Settings → Twitch → Connect Twitch**. Authorize the broadcaster account.
5. Type `!join north` from a real account in that channel. Then try `!profile`, `!pledge` and `!vote defend` during an active chapter.
6. Enable **chat replies** only if you want ChatVerse to send messages as your broadcaster account. Output is off by default, moderated and rate-limited. Quiet mode suppresses output.

User/refresh tokens are encrypted with Windows DPAPI for the current Windows user. No tokens are sent to the browser. This is a developer-operated local installation, not a distributable confidential-client binary. On other operating systems, Simulation works; a supported OS token-vault adapter is required before enabling Live. Subscriber lookup is optional and cosmetic, enabled with `TWITCH_SUBSCRIPTIONS=true` before authorization. Core gameplay does not require subscriptions.

Remote viewers play through chat. A streamer-local browser companion is **not a public viewer website**. One authorized channel per installation is supported in this release; cross-channel wars remain the explicitly optional roadmap milestone.

## OBS overlay

In **Settings → OBS overlay**, generate a URL and paste it into an OBS Browser Source: **1920×1080, 30 FPS**, default transparent CSS. The URL grants only minimal read access. Creating a new URL rotates the previous key; revocation stops old sources. Mode-specific cookies keep Simulation/Live sources independent from admin access. A source refresh restores the current snapshot without replaying old toasts. Simulation always displays a synthetic-world badge.

The overlay route and alpha CSS have browser QA; actual composition over game footage in OBS still needs a local OBS session. No OBS control plugin or game telemetry is required.

## AI Steward

Factual template narration works by default without a key. The engine and scheduler decide all outcomes. Optional `STEWARD_ENDPOINT`, `STEWARD_API_KEY` and `STEWARD_MODEL` configure a backend-only HTTPS JSON adapter. This is the **ChatVerse narrative contract**, not a drop-in promise that arbitrary completion endpoints accept it:

```text
POST <STEWARD_ENDPOINT>
Authorization: Bearer <STEWARD_API_KEY>
Request: { eventId, factDigest, model, tone, canonicalFacts, prompt }
Response: { eventId, factDigest, flavor }
```

The adapter may add one short atmosphere sentence from an approved vocabulary; it cannot replace canonical facts. Invalid output/timeouts use the existing template once. Limits: 20 requests/hour and 60/day per environment, four-second timeout, circuit breaker after repeated failures. No automatic model traffic occurs unless configured and explicitly enabled in the dashboard. Model-provider choice, billing and real-provider verification remain optional setup work.

## Storage, backup and recovery

`data/live.sqlite` and `data/simulation.sqlite` are separate authoritative databases; `data/twitch.dpapi` is encrypted auth storage. `.env`, `data/`, `node_modules/` and test artifacts are ignored by Git. Schema version/mode mismatches refuse startup.

Use **Settings → Data & safety → Create a backup** for a consistent SQLite backup. To restore: stop the server, preserve the current DB and any `-wal`/`-shm` companions together in a separate recovery directory, place the selected verified backup at the matching environment filename, then restart. Never copy only an actively changing main SQLite file or mix Live and Simulation files. There is no browser restore endpoint in this release.

Rewards are capped at **100 XP and 100 gold per UTC campaign day**, including one participation welcome. This conservative implementation keeps the cap across restarts; unlike the initial design, it does not infer stream-session boundaries. Classes have equal composite power; gear and faction tactics create the meaningful differences. Season score and lifetime XP are distinct.

## Development checks

```powershell
pnpm check
pnpm test
pnpm build
```

Tests use isolated temporary/in-memory SQLite worlds and mocked providers, never real Twitch or paid AI. The current suite exercises XP thresholds, class parity, RNG, roster selection, tactic ties, replay hashes, ownership, once-only rewards, spending, election quorum, rollover, restart, mode separation, HTTP permissions, OAuth state, chat parsing and narration fallback. The browser QA and measured performance are recorded separately in [BUILD_STATUS](docs/BUILD_STATUS.md).

## Project layout

- `shared/`: types and immutable catalog shared by UI/server.
- `server/engine.ts`: deterministic pure rules and battle function.
- `server/world.ts`, `schema.sql`: transactional application service and relational storage.
- `server/app.ts`: authenticated HTTP, SSE, overlay capabilities and backups.
- `server/twitch.ts`, `vault.ts`: OAuth, EventSub, bounded chat output and encrypted credentials.
- `server/steward.ts`: optional grounded narration and deterministic fallback.
- `src/`: coherent React dashboard, map, character UX, battle replay and transparent OBS route.
- `tests/`: meaningful rule, persistence, permission and integration tests.
- `docs/`: original plan, current build status and demo guide.

Architecture refinements: use Node 24's built-in SQLite and explicit SQL instead of Drizzle/native addons; plain typed fetch + SSE snapshot invalidation instead of a query-cache dependency; deterministic battle inputs are frozen separately from current entities. See [planning index](docs/PRODUCT_SPEC.md) for the full intended destination. Items explicitly listed as later milestones are not represented as shipped features.

Visual assets combine authored SVG/CSS with an original generated Everfall panorama, the UI icons are Lucide (ISC), and fonts are local system/Georgia. The [design polish record](docs/DESIGN_POLISH.md) includes artwork provenance, the generation prompt and visual verification. The provided design reference is retained in documentation for inspiration; it is not used as production art or proof of functioning integrations. Review reference/brand rights before public submission. Source code is not assigned a public redistribution license yet.
