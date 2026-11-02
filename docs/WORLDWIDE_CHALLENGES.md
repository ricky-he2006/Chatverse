# Community world races and territory development

## Completion rules

The default challenge requires **10 distinct community members plus the streamer** to complete the objective. Member evidence alone cannot finish the race. Streamer identity is server-derived; viewers cannot claim that role. Existing published objectives retain their original rules.

Publishing supports member targets (1–100), team-entry targets (1–100), or one representative finisher, with an optional streamer requirement. Team rosters and achievements are manually reviewed; this does not host matches or automate tournament brackets. In team format a verified streamer team entry can count as one team and meet the streamer condition. In member format the streamer is separate from the member target.

Screenshots are evidence, not automatic proof. Owner reviewers approve/reject with a reason. One identity contributes once; rejected evidence can be replaced with audit history retained. Exact image hashes cannot count again in an objective, including across communities. Twitch does not supply general Valorant/Fortnite gameplay results.

Completion time is the later of the target-th approved contribution's receipt and the required streamer's receipt. Review speed does not decide placement. Standings remain provisional until the entry deadline plus 24-hour review window and all pending reviews are complete. Finalization awards once: 1st 100 prestige, 2nd 75, 3rd 50, later finishers 25. Exact timestamp ties share competition rank. Prestige is separate from spendable gold, XP and kingdom influence.

## Scope and security

Simulation shares a competition authority across four fictional streamer realms. Live supports one authorized channel per installation. **This is not a deployed worldwide network.** Genuine cross-streamer races require a reachable shared service and multiple independently authorized channels.

Live objectives bind to the authorized broadcaster and are hidden after channel changes. Competitions persist separately in `world-tasks-simulation.sqlite` and `world-tasks-live.sqlite`. Back these up separately from realm-world exports. Simulation has an explicit race-clock advance; Live does not.

Authenticated own-evidence and owner-review routes protect images and notes. Public standings expose progress, streamer status and placements, not evidence. PNG/JPEG uploads: 5 MB maximum, minimum 320×180, maximum 30 million pixels. Storage ceiling: 200 MB per environment; no automatic archival service. Human review remains necessary for altered images, rosters and rule interpretation.

## Territory development

Population milestones at 25/100/250/500 citizens reveal outposts and add 5% fortress health each, capped at 20%. Discovery persists. Citizens fund their own kingdom's non-capital territory using personal gold: levels 1/2/3 cost 100/150/200. Each level adds 60 defending HP. Capture clears fortifications.

Ownership, available gold, expected level and idempotency receipts are enforced atomically. No owner shortcut mints currency. Combat v3 freezes district defense in battle inputs; v1/v2 replays retain their rules. Completed battles settle territory and participation rewards once. World schema is version 5.

## Verification

77 regression tests pass, including combined completion, broadcaster identity, channel isolation, evidence privacy, receipt-based rankings, persistent tied awards, atomic purchases and a complete fortified battle/replay. An actual PNG upload was exercised in isolated Simulation browser QA. Hosted competition, real provider credentials and native OBS preflight remain pending.
