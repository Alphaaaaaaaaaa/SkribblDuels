# Live telemetry and UI hotfix v0.49.1

## Root cause

v0.48.0 moved `IndexedDbRawPacketStore.redactSensitiveRecords()` ahead of
`TypoRelayBridge.start()` and awaited the storage scan. Typo transfers its
incoming and outgoing Skribbl relay `MessagePort`s only once during page
startup. If that transfer happened while IndexedDB cleanup was pending, no
listener received the ports. The normalized telemetry store then stayed empty,
the Match telemetry counter remained `Local: 0`, and no active Challenge could
produce a completion candidate.

v0.49.1 starts the relay synchronously and wires the recorder before launching
stored-record redaction as a background task. Redaction failures are logged but
cannot block gameplay telemetry. The regression test fixes this ordering as an
explicit release invariant.

## Userscript entry points

The repository tracks one generated installable Userscript at
`userscript/skribbl-duels-telemetry-inspector.user.js`. v0.48.0 changed its
metadata name from `Skribbl Duels - Telemetry Inspector` to `Skribbl Duels`.
Some Userscript managers therefore retain the older named installation instead
of replacing it. Users upgrading through that rename should keep the current
`Skribbl Duels` entry and remove or disable the older named entry once.

## UI corrections

- Board Challenge icons again use the v0.48 `56%` square sizing.
- Result and winner visuals use smaller proportional avatar, trophy and crown
  dimensions.
- Skribbl avatar layers have no translucent background. Initial fallbacks and
  Discord avatar containers retain it so transparent Discord pixels remain
  readable.
- Match Chat displays only the current code-point count and reserves right-side
  input padding for all three digits of the 300-character limit.
- WebKit scrollbar arrow buttons are hidden; the rounded thumb fills the
  configured 14-pixel scrollbar width.
- Forfeit uses the local Typo-compatible `showConfirmToast` flow and no longer
  calls `window.confirm`.

Gateway Contract v7 and all v0.49.0 Challenge definition versions remain
unchanged.
