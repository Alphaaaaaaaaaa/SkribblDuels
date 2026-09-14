# Skribbl Duel profile stat icons

The versioned registry is `registry.template.json`. Add artwork at the exact
registered path, then run `npm run generate:stat-icons`. Missing stat and pin
artwork is intentionally optional: the profile uses compact text fallbacks so
a new statistic can ship before its final icon. Accepted formats are GIF and
PNG; 40×40 with a transparent background is recommended.
