# Skribbl Duels icon template

`registry.template.json` is the single source of truth for future GIF assets.
It contains all 49 stable challenge IDs, their planned file paths and the
metadata icon keys already present in the challenge definitions.

Every Challenge owns a unique direct path. `transcended` now has supplied
artwork; `ate-and-left-no-crumbs` and `guessingoat` reserve their individual
paths and use the normal initial-letter fallback until their artwork arrives.

## Adding artwork

1. Export each asset as a transparent animated GIF, preferably 40x40 pixels.
2. Use the exact `assetPath` from the registry. New Challenges must reserve
   `challenge-icons/<challenge-id>.gif` (or `.png`) when their definition is
   added, even if the artwork will arrive later.
3. Do not rename a `challengeId`. Saved boards and Gateway snapshots use it as
   the permanent identifier.
4. Keep countdown symbol filenames case-sensitive: `countdown_G.gif`,
   `countdown_O.gif` and `countdown_ExclamationMark.gif`.

`currentMetadataIcon` documents the symbolic icon key used today. A `null`
value means that the current definition has no symbolic icon yet; the GIF path
is still reserved and ready for artwork.

Missing Challenge files are legal and use the fallback; missing UI or countdown
files fail the build. When final files are supplied, the build embeds them into
the userscript so skribbl.io never depends on relative paths hosted by the game
itself.
