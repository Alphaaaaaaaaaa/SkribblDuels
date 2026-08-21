# Skribbl Duels icon template

`registry.template.json` is the single source of truth for future GIF assets.
It contains all 46 stable challenge IDs, their planned file paths and the
metadata icon keys already present in the challenge definitions.

## Adding artwork

1. Export each asset as a transparent animated GIF, preferably 40x40 pixels.
2. Use the exact `assetPath` from the registry, or change only the registry
   when a different filename is intentionally required.
3. Do not rename a `challengeId`. Saved boards and Gateway snapshots use it as
   the permanent identifier.
4. Keep countdown symbol filenames case-sensitive: `countdown_G.gif`,
   `countdown_O.gif` and `countdown_ExclamationMark.gif`.

`currentMetadataIcon` documents the symbolic icon key used today. A `null`
value means that the current definition has no symbolic icon yet; the GIF path
is still reserved and ready for artwork.

When the final files are supplied, the build will validate dimensions and
embed the assets into the userscript so skribbl.io never depends on relative
paths hosted by the game itself.
