# Reconnect, stable draft UI and icon template v0.42.0

## Gateway Contract v3 resume

The browser retains only a resume cursor containing the active match ID and the
last validated server revision. On each authenticated connection it may send
those values in `HELLO.resumeMatchId` and `HELLO.lastServerRevision`.

The Gateway remains authoritative. It resolves the authenticated account to its
in-memory active match, rejects a mismatched ID, rebinds the participant's send
channel and publishes the complete latest snapshot. `WELCOME` always includes:

- `resumeStatus`: `not-requested`, `resumed`, `not-found` or `mismatch`;
- `resumedMatchId`: the restored match ID only when status is `resumed`.

The client keeps a visible match during a transient transport reconnect only
when the resume can still be attempted. A non-resumed `WELCOME` clears the
cursor and stale Gateway snapshot. The normal local match/board persistence is
then reconciled by the product layer.

An unexpected disconnect marks the real participant offline and starts a
30-second grace timer. Existing ready, draft, parity-reveal and countdown timers
continue. A draft timeout may therefore make the normal authoritative autopick
while the player is offline. Reconnecting cancels the grace timer; expiry aborts
the match with `player-reconnect-timeout`.

The grace state is intentionally process-local in this milestone. Durable
multi-instance resume requires later match persistence and shared coordination.

## Draft UI stability

The old 700-ms mount guard rebuilt the entire active Duel tab merely to refresh
seconds. Replacing the scroll container destroyed the user's position and could
make a 15-second server turn appear to last less than one second.

v0.42.0 keeps the DOM stable. Deadline nodes update their text in place, while
full rendering occurs only for an actual Gateway state revision or UI action.
During the draft the panel is centered, account/navigation chrome is reduced,
and the two current choices appear before the incremental board and pick
history.

Left Arrow selects offer index 0 and Right Arrow selects offer index 1 only
when all of these conditions hold:

- the authoritative phase is an active selecting draft;
- it is the authenticated local account's turn;
- no input, textarea, select or contenteditable element is focused;
- no modifier is held and the key is not an auto-repeat;
- the current match revision has not already submitted a choice.

Both click and keyboard input share the same single-submit guard.

## Board hover and tooltips

Individual fields have no box shadow. Non-empty fields transition their
transform over 150 ms and scale to 0.9 on hover. The floating board remains
transparent to pointer input outside fields, while each populated field accepts
hover solely for its tooltip.

Active-match and drafted-field tooltips show the challenge name and full
definition. The existing word-aware wrapper keeps every tooltip line at no more
than 50 characters.

## Lobby-change series resets

`Back to back` v3 now declares `resetOn: ['lobby-change']` instead of depending
on one particular `LOBBY_CHANGED` reducer message. `OMG Hacker?!?!?` already
uses the same lifecycle boundary. Both therefore reset from the canonical
`lobbySessionId` transition even when the first event from the new lobby is a
hydration or round event. Claimed challenges remain immutable.

## GIF asset registry

`challenge-icons/registry.template.json` contains:

- all 46 stable challenge IDs;
- one planned `.gif` path per challenge;
- each currently defined symbolic metadata icon key;
- logo, Settings and About paths;
- countdown paths for `5`, `4`, `3`, `2`, `1`, `G`, `O` and `!`.

Artwork is not fabricated by this release. Once supplied, a later build step
will validate the GIFs and embed them or publish hash-addressed assets without
changing challenge IDs or stored boards.
