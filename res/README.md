# Skribbl Duels resources

Product-managed binary resources live below this directory:

- `about-icons/` contains About/Help tutorial and Contact artwork.
- `challenge-icons/` contains Challenge, launcher and countdown artwork plus
  the canonical icon registry.
- `sound-effects/` contains supplied audio plus reserved sound paths.
- `stat-icons/` contains Profile statistic and utility artwork.

The generator scripts resolve registry paths from the repository root and
embed supplied bytes into the installable userscript. Runtime UI code must not
depend on these relative paths being served by skribbl.io.
