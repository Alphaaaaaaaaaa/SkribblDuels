# Independent telemetry and chat polish — v0.72.0

Skribbl Duels observes the game's Socket.IO connection through its own passive
page hook and read-only MessageChannel. Typo is optional for the normal Skribbl
event stream. Typo-specific Challenges still require the relevant Typo features.

## Source selection

| General → Telemetry port | Behavior |
| --- | --- |
| Auto · Duels + Typo compatible | Prefer the independent port; use the Typo relay when the own hook is unavailable. Both extensions can run together. |
| Duels port | Use only the independent game stream. Typo's tools and supplementary DOM adapters can still run. |
| Typo port (legacy) | Use only the existing Typo message/emit ports. Reload if their one-shot transfer was already missed. |

The source is fixed for each active lobby. Changing the preference during a
lobby takes effect after leaving or reloading; the UI displays that state.
Independent incoming and outgoing packets share one ordered channel. Each
source remains observable, but only the selected source reaches the recorder,
decoder, state store and Challenge provider. A late own hook never silently
mixes its partial lobby stream into an already selected Typo session.

`SkribblSocketTap` observes `window.io` assignments and the exposed Socket
prototype, then each game socket. It preserves factory aliases, socket method
receivers, arguments and return values. Incoming packets are cloned before
game handlers mutate them. The outer logical `emit` is observed even when
Typo subsequently expands a custom-color drawing into several physical packets;
nested wrapper calls do not become duplicate telemetry. Only game hosts under
`skribbl.io` are eligible. Gateway/auth sockets and transport credentials are
excluded; login codes are removed before crossing the own channel.

The own port has no message handler that invokes socket commands. It does not
replace game source, mutate draw commands, write to Typo ports, overwrite their
`onmessage`, remove game listeners or disconnect the game. Typo's existing
listeners continue receiving their data. New runtimes obtain fresh channels
from one page hook; old sockets/port generations are ignored. Returning from
the browser page cache reopens the channel and reconciles a missed departure.

## Contract boundary

- Gateway wire Contract **19**; Gateway **0.14.0**; client package **0.13.0**.
- Telemetry Contract **1.2.0**, schema **1**. The additive `LOBBY_LEFT` event
  has `{ method: 'duels-socket', reason }`; it closes local play-time/drawing
  observation and confirms the homepage after a real game disconnect.
- Existing **1.1.0** replay fixtures remain compatible.
- Social database readiness remains **18**. No new Supabase migration or
  Railway environment variable is required when upgrading from v0.71.0.
- Challenge/Duel modules consume normalized events and never inspect page
  sockets or numeric packet IDs. Gateway authority and claim validation remain
  the competitive boundary; a browser capture is not cryptographic game proof.
- Gateway `HELLO` advertises the current extension capabilities. Without Typo,
  draft candidates requiring Typo Challenges, Drops or Image Lab are excluded.

The compatibility hook depends on the game's standalone Socket.IO API. If a
future game build hides/replaces that API, Auto can fall back to Typo, and the
Settings status exposes the missing connection. Installing/replacing a script
inside an existing lobby cannot recreate packets sent before observation began:
reload Skribbl once after this update to capture the next complete session.

## Presentation

Friends' lobby information uses `German · Private · 1/8`. The permission labels
are **Public / Always / None**; Always retains the existing internal `private`
value so previous private-lobby opt-ins need no database rewrite.

Quick Messages and private Match chat share the 132-item grouped picker, Slimy
button, Ctrl+E, Shift-click, Unicode counter and safe emoji/link renderer.
Emoji-only messages are enlarged, including native-chat mirrors of Match
messages. `:closed:`/`:open:` replace the two score-based picker tokens; stored
legacy tokens remain readable. Emoji images use empty alt attributes and no
image title; picker buttons keep their accessible names and dedicated tooltip.
Homepage friend avatars scale to 1.12 on hover/focus, with reduced-motion support.
Tooltip boxes and arrows are clamped to the viewport, including left anchors.

## Verification

`test:v072` exercises passive capture, dual-port delivery and source arbitration,
logical-vs-wire Typo color expansion, cloning/redaction, native method returns,
source changes, unrelated/old sockets, runtime restart and cached-page restore.
It also exercises the actual Match composer and keyboard handlers, short/legacy
tokens, decorative images, native-only drafts, homepage locks and tooltip bounds.
Existing chat/history/privacy/match-lifecycle suites remain part of `npm test`.
These are local automated checks; the live two-browser game/Typo compatibility
matrix remains the next certification gate.
