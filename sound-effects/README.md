# Skribbl Duels sound registry

Place optional sound files at the paths declared in `registry.template.json`.
Accepted formats are `.ogg`, `.mp3`, and `.wav`. The build embeds files that
exist and validates every registry path. Missing files intentionally produce a
silent no-op at runtime; no remote request and no broken audio element is made.

`countdown.ogg` is one tick. The client replays it once for every visible
countdown second. Button effects are intentionally deferred.
