# Skribbl Duels Product Foundation v0.33.0

This phase freezes the current challenge pool at 46 and introduces the first product-facing architecture around it.

## Match freeze semantics

A finished Duel does not stop or alter skribbl.io. The telemetry core continues observing the page locally for debugging and diagnostics. The Match Telemetry Gateway, however, refuses to create or transmit new Duel server envelopes once the Match State Contract reaches `phase: "finished"`.

After the win target:

- skribbl.io continues normally;
- the players may remain in the same lobby;
- local telemetry and the development inspector continue;
- no new Duel progress or claims are forwarded;
- no further board fields can change ownership;
- the final score, winner and field ownership are immutable.

## Packages

### `@skribbl-duels/product-core`

Contains:

- Challenge Manifest v1;
- Draft Constraint Engine;
- Match State Contract v1;
- Match Telemetry Gateway;
- versioned local UI settings.

### Product UI

The telemetry-inspector userscript now also mounts:

- the central `SD` launcher;
- Duel, Match, Chat, Settings and About tabs;
- an independent challenge-board overlay;
- screen anchors and custom positioning;
- drag, lock, scale, opacity, collapse and visibility settings;
- local system messages for server-confirmed challenge claims.

## Draft compatibility

Blind Guess and Drunk Vision both declare:

```text
conflictKeys: ["primary-visual-obstruction"]
```

They can never coexist on one board. Deaf Guess does not declare that conflict and may coexist with either challenge.

The constraint system is generic and can later cover additional challenge conflicts, overlap limits, category limits and capability requirements.

## Completion messages

The chat adapter adds:

```css
--COLOR_CHAT_BG_LEAVE_ALT: #FFD4BD;
--COLOR_CHAT_BG_LEAVE_BASE: #FFEADF;
```

Messages are inserted locally only after a claim reaches the confirmed `CHALLENGE_CLAIMED` state or after a confirmed opponent claim is received from the future Duel server.

## Public development API

```js
skribblDuelsProduct.manifest.list()
skribblDuelsProduct.draft.generate({ format: 'ranked' })
skribblDuelsProduct.match.startDemo('ranked')
skribblDuelsProduct.match.getState()
skribblDuelsProduct.match.canSendTelemetry()
skribblDuelsProduct.match.getTelemetryStats()
skribblDuelsProduct.settings.updateBoard({ locked: false })
skribblDuelsProduct.ui.open('settings')
```

A future server transport can be connected without changing the telemetry core:

```js
skribblDuelsProduct.match.setTelemetryTransport(async envelope => {
  // send the versioned envelope through the Duel connection
})
```
