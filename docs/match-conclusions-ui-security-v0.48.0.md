# Match conclusions, UI and capture security v0.48.0

## Authoritative conclusions

Gateway Contract v6 adds four authenticated client actions:

- `MATCH_FORFEIT` immediately gives the opponent the win.
- `DRAW_PROPOSE` creates the only active Draw proposal for 30 seconds.
- `DRAW_RESPOND` lets only the opponent accept or reject it.
- `DRAW_WITHDRAW` lets only the proposer retract it.

Every action includes an opaque action ID. Replaying the same request returns
the current snapshot without applying it twice; reusing the ID for another
action is rejected. The Gateway accepts a conclusion only while the match is
running and persists the first result in the revisioned in-memory snapshot.
Later Forfeit, Draw or Claim paths cannot overwrite it.

A reconnect restores the proposal ID, proposer and absolute expiration time.
Expiry, rejection and withdrawal clear the proposal but leave the match
running. Acceptance creates a `mutual-draw` conclusion with no winner or loser.

## Match UI

The Match tab exposes Forfeit only after confirmation. Draw controls reflect
the caller's role: proposer withdrawal, or opponent acceptance/rejection. A
countdown uses the Gateway's absolute expiration time. Finished snapshots add
one system result to Match Chat. Wins can also play the logo/confetti animation;
the Settings toggle is enabled by default and persists with the other UI state.

Duel chat is limited to 300 Unicode code points on both client and Gateway.
Long unbroken content wraps, the log owns its scrollbar and new messages scroll
to the bottom only when the reader was already near the bottom. Wheel events in
the Hub and chat no longer scroll the underlying Skribbl page.

## Visual stability

The userscript does not repaint Draft/Challenge icons for telemetry-only ACK
changes. A known icon is inserted directly and receives a text fallback only if
the real asset fails, avoiding the brief fallback flash during forwarded
telemetry events. Accent, hover, active and form controls now use Skribbl's
panel/input variables.

The telemetry diagnostics panel is still available to developers through the
existing runtime API, but it mounts hidden and is not part of the player UI.

## Private-lobby code redaction

For outgoing `login` relay packets, the `code` property is removed before the
record reaches decoding, statistics or IndexedDB. Startup migrates older packet
records in place, read methods redact defensively and raw exports redact again.
The relay payload is cloned, so capture hardening does not alter Skribbl's own
login request.

## Invisible avatar entitlement

The v0.48 migration introduces `avatar_invisible_entitlements` with RLS: an
authenticated account can read only its own grant and cannot grant itself.
Profile avatar parts remain bounded to `-255..255`; values below `-1` are
accepted by the profile RPC only for entitled accounts. The Gateway publishes
the resolved boolean for profile UI validation.

The grant helper intentionally contains a zero UUID placeholder. Replace it
with the newly supplied profile ID before running it. No older profile UUID is
silently reused.
