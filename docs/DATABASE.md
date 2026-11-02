# Database design

Current schema is version **4**. The additive `chapter_proposals` table persists Lord suggestions and streamer decisions independently in each realm database. Its keys, lifecycle and migration are documented in [the experience implementation addendum](EXPERIENCE_PLAN.md#persistence-and-lifecycle). Companion authentication is memory-only and does not store viewer access tokens in SQLite.

Proposed SQLite relational schema, not executed migrations. Use identical migrations for `data/live.sqlite` and `data/simulation.sqlite`; no cross-file foreign keys. Live OAuth secrets are in a separate OS-protected vault. [Game rules](GAME_SYSTEMS.md) determine business invariants; immutable snapshots are intentional historical records, not substitutes for normalized current state.

## Conventions

IDs are UUID text unless noted; Twitch IDs are opaque text, never JavaScript numbers. Times are UTC integer milliseconds. Gold, XP, vote counts and combat arithmetic are integers. Enforce foreign keys on every connection. Required columns are NOT NULL; optional columns explicitly marked `?`. Every mutable aggregate has `version` and `updated_at`; primary entities have `created_at`. No physical deletes of referenced gameplay history during normal operation. Use status/tombstone plus identity anonymization for privacy requests.

Each file has a single `environment` row with mode CHECK (`live`,`simulation`), schema version, generation UUID and creation time. Verify it against the service's fixed expected mode at startup. Mode cannot be changed by a request header. Reset creates a new Simulation generation; no Live reset endpoint. Global static definitions are stored in each file with the same content hashes and ruleset version.

## Identity and community tables

| Table | Columns beyond conventions | Keys and constraints |
| --- | --- | --- |
| `users` | `id, provider, provider_subject?, display_name, synthetic, status` | UNIQUE(provider,provider_subject); live requires provider=twitch and synthetic=0; sim subjects use `sim:` namespace, never Twitch credentials |
| `realms` | `id, channel_user_id?, slug, name, status, current_season_id?` | channel references users; UNIQUE(channel_user_id); Simulation synthetic channel permitted |
| `realm_roles` | `realm_id,user_id,role,granted_by?,revoked_at?` | PK(realm_id,user_id,role); role streamer/mod; DB role grant required, no client role claim |
| `integration_grants` | `id,realm_id,user_id,provider,secret_ref,scope_set_json,validated_at?,status` | UNIQUE(realm_id,user_id,provider); secret_ref opaque vault handle, scopes a provider metadata set |
| `sessions` | `id_hash,user_id?,role_context,expires_at,csrf_hash` | No raw session secrets; local onboarding session may lack user until OAuth |
| `kingdoms` | `id,realm_id,slug,name,theme_key,banner_key` | UNIQUE(realm_id,slug); UNIQUE(realm_id,id) for scoped FK |
| `memberships` | `id,realm_id,user_id,kingdom_id,joined_at,left_at?,last_switch_at?` | Partial UNIQUE(realm_id,user_id) WHERE left_at IS NULL; kingdom composite FK same realm |
| `membership_moves` | `id,membership_id,from_kingdom_id?,to_kingdom_id,reason,occurred_at` | Append-only membership history |
| `characters` | `id,realm_id,user_id,membership_id,class_id,xp_total,gold_balance,status` | UNIQUE(realm_id,user_id); xp/gold >=0; class FK; level derived from XP |
| `stream_sessions` | `id,realm_id,started_at,ended_at?,source` | source manual/Twitch; open session uniqueness; defines bounded reward period |
| `participation` | `character_id,stream_session_id,first_valid_action_at,last_valid_action_at` | PK(character_id,stream_session_id); not watch time |

No durable “viewer list” is scraped or inferred. Membership count, active opted-in participants, Twitch concurrent audience and subscriber status are separate concepts. Optional `subscription_recognition(realm_id,user_id,status,tier?,verified_at,source)` has PK(realm_id,user_id); stale/unknown is explicit and never changes power.

## Static rules and inventory

| Table | Columns | Invariants |
| --- | --- | --- |
| `rulesets` | `id,version,hash,definition_json` | Immutable once referenced; JSON is versioned rule source |
| `classes` | `id,ruleset_id,slug,base_atk,base_def,base_hp,base_spd,growth_*` | UNIQUE(ruleset_id,slug) |
| `item_definitions` | `id,ruleset_id,slug,name,slot,class_restriction?,atk,def,hp,spd,max_upgrade,base_cost` | Nonnegative stats/cost, one slot enum |
| `inventory_items` | `id,character_id,item_definition_id,upgrade_level,acquired_at` | Upgrade 0..definition max checked in service |
| `equipment_slots` | `character_id,slot,inventory_item_id` | PK(character_id,slot); UNIQUE(inventory_item_id); service and transaction ensure ownership and slot match |
| `economy_entries` | `id,character_id,currency,delta,reason,source_type,source_id,ordinal,balance_after` | UNIQUE(character_id,currency,source_type,source_id,ordinal); immutable; balance_after >=0 |
| `reward_claims` | `character_id,stream_session_id,reward_kind,source_id,xp,gold` | PK(character_id,reward_kind,source_id); bounded per-session caps in serialized transaction |

Gold balance is a transactionally maintained projection of ledger entries. XP total is a projection of reward claims. Reconciliation checks sums on demand; do not recompute the entire ledger per request. No trade, payments, loot-box odds or transferable currency. Purchases/upgrade must insert ledger entry, update balance/item/version and publish event atomically. Concurrent double-spend is tested.

## Geography and seasons

`territories(id,realm_id,slug,name,map_path_key,is_capital,capital_kingdom_id?)`; UNIQUE(realm_id,slug). `territory_edges(realm_id,territory_a_id,territory_b_id)` with ordered IDs and composite FKs to same realm; PK(a,b), no self-edge. `territory_ownership(territory_id PK,kingdom_id,season_id,acquired_battle_id?,version)`; immutable transitions in `territory_transfers(id,territory_id,from_id?,to_id,battle_id?,occurred_at)`. Capitals cannot transfer.

`seasons(id,realm_id,number,ruleset_id,starts_at,ends_at,status)` with UNIQUE(realm_id,number), end > start and one active season per realm. `season_character_scores(season_id,character_id,contribution,participation_count,wins)` and `season_kingdom_scores(season_id,kingdom_id,points,wins,draws)` are indexed projections. `season_awards(id,season_id,subject_type,subject_id,award_key,rank,score)` snapshots finalized standings. Character-level XP and inventory survive season rollover; territory contest and season scores reset through an audited job.

## Chapters, ballots and governance

| Table | Important fields | Integrity |
| --- | --- | --- |
| `chapters` | `id,realm_id,season_id,preset,status,attacker_id,defender_id,target_territory_id,opened_at,deadline_at,paused_remaining_ms?,seed,ruleset_id,version` | One open chapter per realm; valid faction/target scope; frozen seed once created |
| `chapter_participants` | `chapter_id,character_id,side,pledged_at` | PK(chapter_id,character_id); one side per character; side matches membership at entry |
| `polls` | `id,realm_id,chapter_id?,election_id?,kind,status,opens_at,closes_at` | Exactly one chapter/election parent; no arbitrary mixed use |
| `poll_options` | `id,poll_id,key,label,candidate_character_id?` | UNIQUE(poll_id,key); election candidate scoped to kingdom |
| `poll_eligibility` | `poll_id,character_id,side?,eligible_at` | PK(poll_id,character_id); tactic eligibility added atomically on pledge; election eligibility frozen at opening |
| `ballots` | `poll_id,character_id,option_id,cast_at,version` | PK(poll_id,character_id); composite option FK requires same poll; updates permitted before close |
| `elections` | `id,realm_id,kingdom_id,status,nomination_end_at,voting_end_at,term_start_at,term_end_at` | One active election/kingdom; dates ordered |
| `election_candidates` | `election_id,character_id,nominated_at,status` | PK(election_id,character_id); only self-nomination |
| `lord_terms` | `id,kingdom_id,character_id,election_id?,starts_at,ends_at,ended_reason?` | One active Lord/kingdom; end <= scheduled maximum |

Election nomination/eligibility cutoffs and recall rules are defined in GAME_SYSTEMS. SQL constraints cannot express all time/realm conditions; application checks occur inside the same transaction as writes, backed by tests. A Lord is not a `realm_role`; election never grants moderator authority.

## Battles and durable operation

`battles(id,chapter_id UNIQUE,ruleset_id,seed,status,winner_side?,input_hash,output_hash,locked_at,resolved_at?,presentation_end_at?)`. `battle_sides(battle_id,side,kingdom_id,tactic,effective_power,score)` with PK(battle_id,side). `battle_combatants(battle_id,side,character_id,roster_order,stats_json,gear_json,power)` stores immutable historical copies of only combat-relevant data, not live character pointers alone. `battle_rounds(battle_id,round_no,roll_a,roll_b,score_a,score_b)` with PK(battle_id,round_no). `battle_rewards(battle_id,character_id,xp,gold,settled_at)` with PK(battle_id,character_id).

Optional cross-channel tables: `challenges(id,realm_a_id,realm_b_id,proposed_by,expires_at,status,terms_hash)`, `challenge_approvals(challenge_id,realm_id,actor_user_id,approved_at,terms_hash)`, `challenge_battle_realms(battle_id,realm_id,side)`. They require both realms in the same Live file; do not reference another machine's DB. The core battle snapshot contract supports multiple realm origins, but cross-channel settlement is deferred until M7.

`command_receipts(id,realm_id,source,external_key,result_code,result_json,received_at)` UNIQUE(realm_id,source,external_key). `domain_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id UNIQUE,realm_id,type,aggregate_id,aggregate_version,actor_ref?,correlation_id,schema_version,payload_json,occurred_at)`; unique aggregate version/type event ordinal if a command emits multiple events. `outbox(id,event_id,effect_kind,destination,dedupe_key,status,attempts,next_attempt_at,last_error_code?)` UNIQUE(dedupe_key). `scheduled_jobs(id,kind,aggregate_id,due_at,status,lease_until?,attempts)` UNIQUE(kind,aggregate_id); compare aggregate status/version before acting.

`narratives(id,event_id,kind,provider,prompt_version,input_hash,text,status,fallback_reason?,usage_json?,created_at)` UNIQUE(event_id,kind). `audit_entries(id,actor_ref,action,target_ref,request_id,occurred_at,redacted_details_json)`. `overlay_keys(id,realm_id,key_hash,scope,expires_at?,revoked_at?)`; store only hash. `realm_settings(realm_id PK,quiet_enabled,auto_chapters,steward_tone,chat_output_enabled,config_json,version)` uses typed columns for common invariants and versioned JSON only for optional preferences.

## Indexes, queries and lifecycle

Index membership `(realm_id,kingdom_id,left_at)`, character `(realm_id,xp_total DESC,id)`, event `(realm_id,sequence)`, battle `(resolved_at DESC,id)`, poll `(status,closes_at)`, jobs `(status,due_at)`, outbox `(status,next_attempt_at)` and both seasonal score tables `(season_id,score DESC,subject_id)`. Paginate by stable score + ID, never offset huge player lists. Snapshot dashboard counters via bounded aggregate queries/projections, not fetching all citizens.

Migrations are numbered SQL checked into source, tested on empty and previous schemas for both modes. Back up before migration; fail startup on unknown/newer schema. Do not destructively auto-downgrade. Seed references have deterministic IDs and do not collide with Live IDs. Backups use SQLite backup API, daily and before migration, keep seven local copies by default; restore to a new file and validate integrity before replacing active data.

Suggested retention: raw ordinary chat is never stored; command receipts retain minimal sender/command outcome for 30 days, diagnostic logs seven days, safe SSE replay 24 hours, audit and canonical gameplay history through current/previous season pending owner policy. No token/secret in exports. A privacy erasure workflow deletes/revokes auth records, anonymizes user display/subject and narrative mentions, retains anonymous battle calculations and totals, and reconciles backups on expiry. Final retention and published notices are a release task; no compliance claims are implied.

## Implemented October 29 update
World schema 5 includes territory_development. Separate world-tasks-simulation.sqlite and world-tasks-live.sqlite contain objectives, proofs/images, hashes, reviews and idempotent placement awards. These competition files require separate backup from world exports. See WORLDWIDE_CHALLENGES.md for identity, retention and storage limitations.
