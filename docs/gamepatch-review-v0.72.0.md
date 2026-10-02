# Review of the supplied Typo gamePatch — for ticedev

Reviewed 2 October 2026 for the Skribbl Duels v0.72.0 integration. This report
covers the **submitted patched client**, including its `TYPOMOD` additions. It
does not establish that the same code exists in the current unmodified game,
the current Typo release or the backend.

**Main result:** the outgoing drawing wrapper can duplicate commands; reconnect
listeners accumulate; two color boundaries can throw; and the pressure setting
evaluates code from a DOM attribute. These are locally reproducible client
findings. **No server privilege escalation, remote code execution or moderation
bypass has been confirmed.** The backend authorization and validation questions
below need developer-owned integration tests.

## Scope and evidence

- Input: the user's `gamePatch (1).js`, read in full, 2,540 logical lines.
- SHA-256: `75bbaa0ea6d17b36d968275487e4c3c0408c7b321116dd8f5c2039d51563e394`.
- References below are line numbers in that exact snapshot, not upstream links.
- Method: static inspection and isolated Node VM probes with fake sockets,
  fake ports and a minimal DOM. No public room, account or game server was used.
- Reproduction: `node scripts/review-supplied-gamepatch.cjs /path/to/gamePatch.js`.
  The script checks the exact hash before evaluating the selected local helpers.
  Results are in `gamepatch-local-checks-v0.72.0.json`.
- Severity is a provisional **client impact** assessment. A server issue needs
  separate proof of an unauthorized action, recipient exposure or resource cost.

## Reproducible client findings

| ID | Impact / priority | Evidence | Recommended correction |
| --- | --- | --- | --- |
| C1 | Medium; drawing correctness and extra traffic | Shared draw buffer is queued, then modified and queued again; two input commands appear four times in the local wire capture | Flush independent batches, reset the buffer and account for inserted commands when calculating undo offsets |
| C2 | Medium compatibility | An emit without a second argument throws; ordinary emits lose their native chainable return | Guard the event/payload shape and return the delegated emit result |
| C3 | Medium lifecycle / repeated sends | Three simulated connections register three `socketEmit` listeners; one local event produces three deliveries | Install once per socket/lifecycle, remove only owned handlers and retain the intended socket reference |
| C4 | Medium robustness | Palette index 26 and custom-black code 10000 throw; adjacent valid values work | Use one validated color decoder and exclusive palette bounds |
| C5 | Low defense in depth; exposure-dependent | The pressure DOM attribute executes a benign code marker | Replace `eval` with named curves or bounded numeric parameters |
| C6 | Low text correctness; conditional lifecycle risk | The 100-unit chat split divides a surrogate pair | Split by code points and bind queued chunks to a stable connection/lobby epoch |

### C1 — draw buffer aliasing and unchanged undo offset

Lines **1843–1877**, especially **1851–1867**. The same `buffer` array is added
to `events` before a color sequence, but it is never emptied or replaced.
Appending the following command changes the already queued batch. The final
flush queues that same array again. Input references are correctly cloned;
the fault is in the subsequent batching.

With two local logical commands and a stubbed one-command color marker, the
captured draw batch sizes are **[2, 1, 2]** and the original commands occur
**four times**. The color helper is stubbed to isolate the wrapper; the native
Typo color sequence normally contains more than one marker. In addition,
`sent` is initialized to zero and never advanced, so the emitted undo offset
stays at the initial `dt` value. The probe records **8** for that offset.

Use a fresh array after every flush and immutable batch snapshots. Define undo
offsets against the actual server history, including marker insertion and
removal. Test normal → custom → custom → palette transitions, multiple changes
in one batch and reconnect replay. Do not replace the user's local command
history with its wire encoding.

### C2 — the emit wrapper narrows Socket.IO semantics

Lines **1844–1849**, **1874–1877**. Destructuring `event[1]` assumes every emit
has a record payload; it throws for a no-payload event. The ordinary delegation
does not return `originalEmit(...)`, so callers that expect the socket back
lose chainability. The probes reproduce `TypeError` and a false chain-return
check. This does not mean the game necessarily emits such a no-payload event
on its current normal path.

Transform only a validated `data` drawing packet. Preserve other events,
argument counts, callbacks, receiver, exceptions and return values. Guard the
drawing array before iterating. Keep wrapper installation idempotent.

### C3 — reconnect listener accumulation and broad teardown

Lines **1819–1841**. Each `connect` callback adds another anonymous document
listener. The callbacks reference mutable outer `S`, so old listeners address
the latest socket rather than the socket that created them. A reconnect also
installs another data forwarder and wraps `emit` again.

Three executions of the original listener block register **three** handlers
and produce **three** fake socket emits for one document event. Separately,
`S.off("data")` in the disconnect helper removes all data listeners, including
the game renderer and other integrations. It is acceptable only as a deliberate
final teardown, not as ownership-aware listener cleanup.

Register one named/abortable listener, capture its socket, dispose it on the
correct lifecycle and remove only that integration's listeners. Ensure the
disconnect notification occurs once. Test reconnect, failed joins and switching
rooms without reloading the page.

### C4 — incompatible custom-color and palette boundaries

The `setColor` handler accepts custom codes **>= 10000** at **339–347** and the
MSI helper does the same at **217–241**. Preview helpers use **> 10000** at
**1206–1217**, so encoded custom black (**10000**) instead indexes a nonexistent
palette entry. `Bt` at **1238–1247** uses yet another cutoff, **1000**, and clamps
palette values through `kt.length` inclusively. With 26 colors, index **26** is
out of bounds.

The local probes find: palette 25 works; palette 26 throws; custom 10000 throws;
custom 10001 works. Share one finite-integer parser: palette `[0, length)` or the
documented encoded RGB range. Reject/ignore invalid values before array access.
This is a client crash path; a remote player reaching it depends on backend
packet validation, which is not in the attachment.

### C5 — code-valued pressure configuration

Lines **1409–1414** evaluate `typo_pressure_performance` and call its result.
A benign local marker confirms arbitrary code execution **when that DOM
attribute is controlled**. The supplied file does not show a remote player
setting it. A same-page script already has broad page privileges, so this is
not evidence of a new remote execution boundary by itself.

Use allowlisted pressure curves with finite/clamped parameters and output. If
settings can be imported from untrusted files or synchronized externally,
trace and validate that separate path. Do not turn imported text into code.

### C6 — Unicode splitting and deferred chat ownership

Lines **2489–2498** use `substring(0, 100)` and schedule the remainder after
180 ms. A string containing 99 ASCII characters followed by one astral emoji
is split into two invalid halves. The local probe confirms the split.

The delayed callback also overwrites the current input and submits through
the then-current `S`. A newer draft or lobby switch during the delay could
therefore be affected; that lifecycle consequence is a static concern, not a
live reproduction. Queue code-point-safe chunks explicitly, preserve new drafts
and cancel remaining chunks when their original connection/lobby changes.
Backend message length and rate limits still need independent enforcement.

## Additional static concerns to verify

| Location | Observation | Assessment / next check |
| --- | --- | --- |
| 258–266, 1840–1841 | Typo transfers two ports through a same-window message; the incoming port also accepts packets and forwards them to `S.emit` | Separate telemetry from command permissions. Validate command shape/budget. A `'*'` target for a message to the same window is not by itself proof of cross-origin disclosure; receiver checks in the extension are outside this file |
| 2019, 2199–2201, 1498–1500 | Hydrated drawing history is assigned directly; live draw packets first pass through the MSI decoder | If hydrated server history contains MSI markers, normalize the history and live paths consistently. Otherwise a late join could replay marker strokes or use the wrong color. Conditional, not reproduced against a real room |
| 1287–1294 | The Y extent contains `Math.abs(i - i) / 2`, always zero; the lower Y bound also uses the horizontal extent | Review the original coordinate variables and test vertical/diagonal off-canvas strokes. Client clamping is not a substitute for server numeric/length validation |
| 1297 onward, 1269–1274 | Drawing and checkpoint helpers assume valid command arrays and canvas bounds | Reject nonfinite/oversized values and short/unknown commands before rendering; test bounded memory and paint cost locally |
| 1698–1700 | Audio resume uses a regular promise callback and calls `this.playSound` | Likely lost receiver on the suspended-context path; use an arrow/bound callback. Reliability issue |
| 2503 | Stored avatar JSON is parsed without an error fallback | Corrupted local storage can stop initialization; catch parse/shape errors and restore defaults |
| 246–255 | An unused helper assigns implicit global `inserted` | Declare local state; no call to this helper appears in the snapshot |
| 157–181, 194–215 | MSI buffering and closest-color cache have no visible size bound | Add per-round limits/reset and test malformed/incomplete sequences; remote reachability depends on allowed server draw input |
| 652–653, 467–481, 2503 | Chat pruning reads `chatDeleteQuota`, with no initialization/load in this file | Dormant/incomplete client pruning; does not describe server chat retention |
| 615 | A Rooms modal calls `roomsUpdate`, absent from this snapshot | Apparently a removed/partial room-browser branch; do not infer a working private-room listing API |
| 2400–2410 and translated help | Custom-word start logic accepts five entries, while help describes ten | Align UI and backend minimum/maximum rules; authorization and parsing remain server questions |

## Interesting and undocumented material

### ADMIN, privileges and chat visibility

`k = 4` at **1710** is an admin **flag bit**, not a packet ID. User flags enter
the client at **2225–2228**. That bit gives the avatar glow/hue rotation
(**2221–2222**), seven background bubbles and an `ADMIN` tag
(**2242–2253**). The wave branch uses `r === 2`, but this code only assigns 1 or
-1, suggesting unused future/legacy artwork.

The player popup shows kick/ban to the owner or an admin and hides actions
against an admin/self (**604–612**). `Ba` also lets a local admin view drawer or
already-guessed chat that the ordinary client filters (**2265–2268**). These
are client presentation checks. Changing a tag/flag locally does not establish
server privileges. The backend must enforce moderation roles and must not
broadcast restricted content to unauthorized recipients if secrecy is intended.
The file alone cannot establish whether such content is broadcast.

### Avatar updates: packet 9, rename 90, no packet 99

The receiver already handles **data ID 9** with `{ id, avatar }` at
**2099**, **2142–2143**, and **ID 90** with `{ id, name }` at
**2100**, **2145–2146**. There is no matching outgoing avatar/rename control
in this snapshot; login includes the initial avatar at **1904–1913**.
Consequently, in-round avatar updates are supported by the display path, but
the authorized server request/trigger is undocumented here. **ID 99 is neither
handled nor emitted in this file.** Its absence does not prove a hidden command
or explain the developer's numbering decision.

Other appearances of 99 are a palette RGB component and holiday sprite
indices, not socket operations. The avatar uses three atlas parts with limits
28/57/51 (**2–5**) plus an optional fourth special sprite (**521–534**).
The homepage logo has a 1% random special chance; December 19–26 enables a
35% holiday special chance with sprites 96–99 (**1745**, **2530–2533**).
Halloween is October 24–31 (**1746**, final HTML dataset assignment).
These cosmetic branches are not evidence of an admin entitlement API.

### Protocol and round modes observed in this client

The following is a source inventory, not permission to send undocumented
requests or an authoritative backend specification.

| Direction | IDs / meaning |
| --- | --- |
| Server → client | 1 join; 2 leave; 5 vote-kick update; 8 reaction; 9 avatar; 10 lobby snapshot; 11 state; 12 setting; 13 hints; 14 time; 15 correct guess; 16 close guess; 17 owner; 19 draw; 20 clear; 21 undo; 30 chat; 31 system; 32 spam warning; 90 rename |
| Client → server | 3 kick; 4 ban; 5 vote-kick; 6 report; 7 mute; 8 reaction; 12 setting; 18 word choice; 19 draw; 20 clear; 21 undo; 22 start/custom words; 30 chat |
| Separate event | `login` includes join/create/name/language/code/avatar; treat code as sensitive and omit it from telemetry |

State IDs **0–7** cover waiting, starting, round announcement, word selection,
drawing, round end, results and private-room setup (**10–17**, state handlers).
Word modes are Normal/Hidden/Combination (**30–33**). Combination presents two
sets of word choices and submits two indices; Hidden changes the word-length
display to question marks. Correct guessing reveals the answer to the player
who has earned it. Check server recipient filtering rather than relying on
these UI branches to protect hidden answers.

Round-end reasons include everyone guessed, time expired, drawer left and
**drawer skipped**. This client renders the skip reason but contains no clearly
identified admin skip request. Reports combine Toxic/Spam/Bot bits **1/2/4**
(**2454–2462**). Settings indices cover language, slots, draw time, rounds,
word count, hints, word mode and custom-only (**20–28**).

### Typo's hidden drawing channel and other integration hooks

The MSI system encodes data in special draw commands, using canvas coordinates
as a numeric carrier. Init markers are brush/black/size **5** at the origin;
the color reset marker uses size **39**. Some nearby comments describe older
sizes, so the executable values matter. Mode 1 is the custom-color transform;
an unknown mode falls back to identity. Custom RGB is encoded as **10000 +
24-bit RGB**. The wire command uses the closest palette color, chosen by Lab
distance, so non-Typo clients see an approximation (**194–241**). This is a
compatibility convention, not a server-authenticated channel.

Other hooks select tool/size/color, clear the canvas, submit local draw commands,
collapse undo actions and disable cursor updates (**300–364**). Clear logging
captures a PNG before clearing; undo history has 50-command checkpoints.
These enable opt-in drawing replay, local practice and post-round recaps without
using undocumented moderation or identity commands. Replay must preserve
clear/undo/color semantics and wait for normal answer revelation.

Pointer processing targets **90 FPS**. DOM switches can remove its throttle or
change the normal **eight commands / 50 ms** flush to a zero-delay interval
(**1470–1500**). This proves client limits are adjustable, not that the backend
accepts unbounded rates. MSI expansion additionally increases physical traffic.

`joinPractice` creates a fake lobby and a non-network socket proxy
(**1528–1544**). Its events must never be confused with certified competitive
play. Other branches include mobile top/bottom chat, six virtual keyboard
languages and VisualViewport layout. Native chat text and names are inserted
using `textContent` (**642–646**), a useful defense against HTML injection in
this path; no chat-text HTML execution was identified.

## Backend verification for ticedev

Use a developer-owned test server/room with consenting test clients. The client
file cannot prove the following bugs exist; these are checks with expected
invariants and proposed mitigations.

| Boundary | Expected invariant / verification | Mitigation if it fails |
| --- | --- | --- |
| Admin/owner moderation | Nonowners/nonadmins cannot kick, ban, change settings or start a room; protected targets stay protected even when UI checks are absent | Derive roles from authenticated server state; enforce each action and audit denials |
| Drawing authority | Only the current drawer/current round can draw, clear or undo; delayed packets from previous rounds cannot affect the next | Validate role, round epoch, finite numbers, command shape, color/tool/size, undo bounds and cumulative budget |
| Drawing resource cost | Large or incomplete batches/MSI sequences cannot cause unbounded fanout, history, memory or paint workload | Bound packet bytes/commands/coordinates, cumulative history and sender rate; validate before broadcast |
| Hidden information | Unsolved unauthorized clients do not receive answer strings or restricted guessed/drawer chat when those are meant to be secret | Filter recipient payloads on the server; cosmetic hiding is insufficient |
| Identity / avatar / rename | Changes affect only the authorized player, respect entitlement/range rules and cannot set admin flags | Separate mutable cosmetics from authenticated flags; validate ownership and schema |
| Chat / reports / reactions | Unicode length, chunking, duplicate voting/reporting and reconnects obey server limits | Normalize and bound text; per-account/IP budgets as appropriate; per-round idempotency |
| Room privacy / join | Knowing a room identifier does not bypass its configured server access policy | Enforce access on join; do not equate a UI-only join toggle with access control |
| Extension trust | A writable page port is not treated as trusted moderation or competitive evidence | Keep telemetry passive; expose separate narrowly validated actions; treat browser evidence as untrusted input |

For each failed invariant, record test build, role, room/round scope, expected
rejection, actual effect and a private reproduction. No remote abuse or live
bypass is claimed by this report. The concrete first fixes are **C1/C3**, then
shared color validation, wrapper transparency and removal of code-valued
pressure configuration.

## Duels integration decisions from this review

v0.72.0 observes the original game socket through a separate read-only port;
it does not copy or inject the submitted patched game. Incoming data is cloned
before client mutation. Outgoing logical commands are captured once even when
Typo expands them. The source is pinned per lobby; Typo's port listeners remain
intact. Login codes are excluded. Typo-dependent Challenges remain gated by
capabilities. Server Challenge validation stays authoritative, while page
telemetry itself is not cryptographic proof of an untampered game client.

Primary API references used for the integration:
[Socket.IO client API](https://socket.io/docs/v4/client-api/),
[Socket.IO event listeners](https://socket.io/docs/v4/listening-to-events/),
[MessagePort message events](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event).
