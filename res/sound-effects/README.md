# Skribbl Duels sound registry

Place optional sound files at the paths declared in `registry.template.json`.
Accepted formats are `.ogg`, `.mp3`, and `.wav`. The build embeds files that
exist and validates every registry path. Missing files intentionally produce a
silent no-op at runtime; no remote request and no broken audio element is made.

The current supplied filenames are `join-queue.ogg`, `leave-queue.ogg`,
`countdown.ogg`, and `match-found.ogg`. Audio is embedded into the userscript
only when `npm run build` runs; copying files beside an already-built
userscript cannot make that installed build discover them.

`countdown.ogg` is one tick. The client replays it once for every visible
countdown second. Button effects are intentionally deferred.
