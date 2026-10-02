# Skribbl Duels roadmap — v0.72.0

Updated 2 October 2026. The table keeps earlier product concepts alongside the
new gamePatch opportunities. **Easy / Medium / Hard / Very hard** describe
implementation and certification effort, not a delivery date. Proposed ideas
are not implemented by this release.

Already delivered: Casual 3×3/five claims and Ranked 5×5/thirteen claims,
authoritative drafts/claims/results, restart/reconnect infrastructure, private
Match chat, 53 Challenges, local stats/profile pins, Discord identity, Coin
ledger, Daily Skribble, Slots, Friends/presence, invites, 24-hour Quick Messages
and privacy controls. v0.72.0 adds independent telemetry, Typo coexistence and
shared Match emojis. Competitive Challenges are separate from a future durable
account Achievement system. Elo rules exist; production rating writes do not.

| Feature / idea | Descriptive usage | Requirements | Difficulty | Approach / conceptualization | Status / priority |
| --- | --- | --- | --- | --- | --- |
| Telemetry certification | Reliable Duels with/without Typo, reconnects and game updates | Live two-browser matrix; full/late joins; custom-color/undo fixtures; source diagnostics; failure recovery | Hard | Test Auto/Own/Legacy across Chrome/Firefox, lobby changes and both extensions' startup order; pin one source per lobby | Own port implemented; P0 certification |
| Claim recovery | Every valid local completion reaches an authoritative Claim once | ACK/replay failure matrix; delayed/duplicate events; reload and Gateway restart tests | Hard | Record pending candidate, evidence IDs and server cursor; resume only unacknowledged evidence; keep unresolved Claims pending | Recovery foundation exists; P0 certification |
| Ranked Elo / seasons | Persistent rating, provisional placements and season ranks | Supabase rating transaction/history; versioned Elo rules; idempotent conclusion writes; anti-farming checks | Hard | Existing Elo v1 rules; define Draw/Forfeit/disconnect/cancel/rematch/repeat-opponent effects; store history before leaderboards | Planned; P1 |
| Match history | Review opponent, board, accepted Claims and rating changes | Account-scoped history schema/API; pagination; privacy/export; retention | Medium–Hard | Result detail with score, duration and evidence summaries; Friendly matches have their own format flag | Planned; follows rating persistence |
| Leaderboards / records | Compare seasonal ranks and verified personal/world records | Certified server stats; seasons; tie rules; moderation; farming protection | Hard | Language/format scopes; record rarity and ownership; keep display-only profile stats separate from reward-bearing records | Planned; follows certified history |
| Server career stats | Carry profile progress between devices | Versioned semantic telemetry scopes; bounded ingestion; aggregate migrations; account privacy | Hard | Preserve per-language word-list denominators; local history stays informational until certified | Planned; Achievement prerequisite |
| Achievements / Advancements | An Achievements tab inside the Duels Profile with account progress and showcase | Definition/progress contract; server evidence scopes; Supabase migrations; idempotent unlocks; visibility | Hard | Green **#53e237 Achievements** button below **View all Stats**; tier ladders for guesses, reactions, play time, words, languages and win streaks; local/certified badges visibly distinct | Earlier concept; P2 after correctness gates |
| Bingo Mode | A Friendly Match/Invite option, eventually for multiple players | New format and multi-participant Gateway contracts; waiting/participating lobby; shared board seed; authoritative line-win evaluator | Medium for 1v1; Hard for multiplayer | Earlier MVP: identical server-seeded 5×5, no free center, first row/column/diagonal wins. Optional draft picks contents; server places them. Multiplayer adds roster/readiness/leave rules | Planned; latest request extends target to multiplayer |
| Parties / 2v2 | Invite friends as a group and play team Duels | Party membership; team identity; multi-player Match authority; shared Claims; disconnect and queue rules | Very hard | Reuse Friends/Quick Messages; add a Waiting lobby and explicit team board/score ownership | Earlier social expansion; Friends already delivered |
| Chain Reaction | New Challenge: First Guesser, then three others solve within five seconds | Distinct-player correct-guess evidence; round-start correlation; duplicate/leave/timestamp fixtures | Medium–Hard | Four total guessers; window starts at the completing player's confirmed Guess; Casual first, Ranked after live certification | Earlier definition retained; planned |
| Challenge certification / balance | Promote eligible Casual-only definitions and improve fair draft variety | Multi-client recordings; reject-reason metrics; versioned definitions; pick/completion rates | Hard | Preserve Blind Guess + Drunk Vision conflict and Deaf Guess compatibility; promote definitions individually | Ongoing; P1 |
| Pet / Slimy companion | Cosmetic profile/home companion reacting to game progress | Pet inventory/state machine; bounded clock updates; ownership persistence; Coin sinks | Hard | Start with one small Pou-like hunger/happiness/XP loop; cosmetic reactions to accepted events; no competitive boosts | Earlier concept; planned |
| Mini-Game catalog | Discover bounded friendly games beyond Daily Skribble/Slots | Generic lifecycle/catalog; eligibility; result evidence; command budget; cooldown/reward rules | Hard | Add one game at a time; rewards require server certification and ledger-backed transactions | Framework planned; Daily/Slots already delivered |
| Coin cosmetics / progression shop | Spend earned Coins on profile/Pet cosmetics | Existing ledger; versioned inventory; atomic purchase; reversals and anti-farming limits | Medium–Hard | Private inventory/history first; deterministic cosmetic unlocks; no rating or Challenge advantages | Ledger delivered; additional sinks planned |
| Drawing replay / gallery | Watch an opted-in drawing after its round ends | Bounded draw-command record; color/undo normalization; consent; retention/export | Medium–Hard | Replay brush/fill/clear/undo on a separate canvas; handle Typo MSI colors; reveal words only when the real round reveals them | New gamePatch opportunity |
| Round recap / spectator panel | Understand guess timing, reactions, scores and round flow | Normalized round/guess/reaction timelines; display filtering; reconnect completeness | Medium | Post-round recap with first-guess timing, scores and safe drawing highlights; no hidden-answer or restricted-chat display | New gamePatch opportunity |
| Friendly drawing exercises | Local speed-drawing practice or themed training | Separate practice lifecycle; semantic canvas-action API; result scopes | Medium | Typo's fake-lobby concept is inspiration only; practice never enters competitive telemetry, rating or Coin certification | New gamePatch opportunity |
| Rich presence / friend activity | More useful opt-in activity cards without stale lobby information | Reliable native lobby scope; privacy-filtered payloads; invitation validation | Easy–Medium | Extend existing presence with drawing/guessing round labels and post-round recaps; preserve join permissions and offline privacy | Foundation delivered; optional extension |
| Shared canvas tools | Consistent Gradient/Transparent Canvas workflows | Semantic draw-action boundary; Typo integration; Zoom/Image Post/Cloud/Save/Image Lab compatibility | Hard | Treat canvas tools as an adjacent platform; preserve transparency and keep Challenge/Drop/reaction observations unchanged | Earlier adjacent-tool concept; not bundled into this patch |
| Localization / accessibility | Complete German/English flows, keyboard and small-screen support | Translation catalog; keyboard/focus audit; reduced-motion and contrast QA | Medium | Translate lifecycle/validation/errors together; keep board movable/scalable/anchored and accessible tooltips | Partial; release quality track |
| Release / security automation | Catch regressions before a wider Casual/Ranked beta | Two-browser E2E; Gateway restart/load tests; staging/canary/rollback; dependency and privacy checks | Hard | Certify P0 failures first, then Casual beta and Ranked beta; review game changes at the protocol boundary | Infrastructure partly delivered; ongoing |

Suggested order: certify the own-port/Claim-recovery matrix → finish shared
Challenge certification → persist Ranked/history → add career stats and
Achievements. Bingo can be a separate Friendly-mode track after the
multi-participant authority contract is specified. Replay/recap is the smallest
new gamePatch feature to prototype locally without changing competitive rules.

The ADMIN flag, avatar-update packet and undocumented client branches are
review subjects, not planned admin, identity or moderation bypass features.
The source audit is in `gamepatch-review-v0.72.0.md`. Detailed earlier decisions
remain in `progression-ecosystem-backlog-v0.64.0.md`,
`ranked-progression-v0.64.0.md` and
`home-authority-ui-sfx-profile-colors-v0.57.0.md`.
