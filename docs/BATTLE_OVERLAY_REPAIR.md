# Battle and overlay repair — October 30, 2026

## Report and cause

The reported Frostpass record had zero East pledges and one North pledge. Cancelling that battle is the intended fairness rule, but the interface did not explain recovery. A generic 65-second advance could be clicked without two armies, on closed history, or during a longer vote without completing it. Overlay setup showed a static illustration, Moments mode silently hides ribbons after 12 seconds, and a stale overlay cookie could shadow a valid admin session after server restart.

## Repair

- Run full simulated battle calls a Simulation-only, owner/CSRF-protected action scoped to the displayed battle and realm. It rallies both kingdoms, checks both have citizens, advances to the actual deadline, and uses the existing authoritative settlement. Repeated resolved requests do not repeat rewards.
- Closed/paused battles disable simulation controls with recovery guidance. Cancelled battles show the actual pledge counts and a new-battle action. A historical selection cannot rally a different active battle.
- Overlay setup renders the actual Overlay component and real realm stream, with a Simulation test announcement. Quiet mode explains why testing is disabled. Pinning and Moments durations are explicit.
- A valid admin session takes precedence over a stale overlay cookie. Overlay-only sessions still enforce mode, realm, expiry, revocation and read-only access. No framing or authentication policy was relaxed.
- A valid capability is cached in tab-scoped sessionStorage after exchange for reauthorization on reload; the fragment is still removed from the visible URL. Revoked keys still fail. Old tabs that never cached a capability need a newly generated overlay URL or a valid owner login.
- Simulation overlay explicitly reports connection, quiet and idle states. The OBS canvas remains transparent; idle state is expected between Moments.

## Verification

TypeScript and production build pass; **82 tests pass**. New tests cover 30/60/180-second completion, deterministic replay, reward idempotency, closed/paused/stale/empty-army safeguards, Live isolation, owner/CSRF protection, overlay projection and stale-cookie precedence.

Browser verification in Emberwatch Simulation: opened a 180-second Frostpass vote, rallied 38 citizens per side, ran the full battle, observed North win with HP 1478/1980 versus East 1201/2070, exercised replay/final controls, and confirmed the separate overlay received pledges and final result. Territory remained North-held. This deliberately produced a new saved Simulation battle; the original cancelled record remains intact. A test announcement reached both the actual setup preview and separate overlay. Computed body and overlay canvas backgrounds were rgba(0,0,0,0). No Twitch messages or paid APIs were used.

Proof: screenshots/repaired-battle-result.png, screenshots/repaired-overlay-result.png, screenshots/repaired-overlay-test.png. Native OBS capture and genuine Twitch Live input still require their separate integration checks. This repair does not certify every feature in the product.
