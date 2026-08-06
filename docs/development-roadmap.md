# Skribbl Duels Development Roadmap

## Completed foundation

| Phase | Status | Result |
| --- | --- | --- |
| Telemetry and protocol state | Complete | Versioned telemetry contract, replay fixtures and protocol/lobby state |
| Challenge system | Complete | 46 modular challenges with automated runtime coverage |
| Product foundation | Complete | Casual 3×3, Ranked 5×5, conflict-aware draft generation and match freeze |
| Account identity | Complete | Discord OAuth through Supabase, RLS profiles and automatic profile synchronization |
| Gateway foundation | Complete | Railway HTTPS service, token verification, profile lookup, `HELLO`/`WELCOME` and heartbeat |
| Release delivery | Complete | ASCII-safe installable userscript tracked at a stable GitHub path |
| Match lifecycle | Complete | New starts abort old local/server matches and dispose superseded userscript runtimes |
| Matchmaking and ready check | Complete | Homepage-only Gateway queues, simulated opponents and 30-second ready state |
| Server-authoritative pair draft | Complete | Two category-aware offers, equal player pick counts, timeout autopicks, server-random parity field and incremental boards |
| Synchronized match start | Complete | Fixed 10-second server countdown, shared start timestamp and activation of only the drafted board |
| Match reconnect continuity | Complete | Contract v3 resume cursor, 30-second server grace, authoritative snapshot restoration and stale-state rejection |
| Draft interaction hardening | Complete | Stable clock updates, centered two-choice surface, Left/Right Arrow input and definition tooltips |
| Lobby-series reset | Complete | Back to back and OMG Hacker reset from canonical lobby-session changes |
| GIF asset template | Complete | Validated paths for all 46 challenge icons plus logo, settings, about and countdown frames |
| Vanilla Hub and match-start stage | Complete | Homepage entry, intro, modal Hub, dynamic Duels/Match navigation and standalone Versus/Draft/Countdown views |
| Persistent Versus identity | Complete | Duel name, language, Discord/Skribbl avatar selection and server-controlled Special entitlement |
| Embedded visual assets | Complete | Real Challenge icons in intro, Draft and board plus animated GIF countdown |
| 3D introduction | Complete | Two non-coplanar, trackless icon orbits with perspective depth and logo crossing |
| UI interaction hardening | Complete | Inherited Skribbl font, contained profile fields and isolated pointer-capable controls |
| Gateway-backed Duel communication | Complete | Participant-only private chat with sanitization, rate limits, message-ID de-duplication and reconnect history |
| Telemetry and claim authority | Complete | Contract v5 batches, ACK cursors, independent server Challenge Engines, authoritative claims and win-target finish |

## Active development sequence

### 1. Match conclusion controls

- Add unilateral Forfeit as an immediate server-authoritative loss for the
  submitting participant.
- Add a Draw proposal that only finishes after explicit acceptance by the other
  participant.
- Include withdrawal, rejection, timeout, reconnect restoration and
  simultaneous-action idempotency.
- Keep results immutable after the first authoritative conclusion.

### 2. Friendly matches

- Add expiring Gateway-owned Friendly invite creation and join tokens.
- Reuse the authoritative Ready, Draft, Countdown and reconnect lifecycle.
- Prevent an invite token from revealing account data before it is accepted.

### 3. Persistence and competition

- Persist matches, participants, boards, claims and final results in Supabase.
- Add Ranked rating updates and match history only after result validation is
  replay-tested.
- Implement two-complete-game series behavior such as Back to back without
  weakening lobby-change resets.

### 4. Product completion

- Finish full German/English translation for Hub, queue facts, Draft, board,
  validation, errors and Challenge descriptions.
- Reconnect/error UX, observability and abuse limits.
- Closed two-player tests, then Casual beta, then Ranked beta.

The immediate next milestone is Forfeit plus mutually agreed Draw. Contract v5
now has authoritative claims and terminal winner state, so these additional
conclusions can be modeled without trusting the browser or conflating a Draw
proposal with a completed result.
The complete approved UI direction is recorded in
`docs/ui-product-direction-v0.41.0.md`.
