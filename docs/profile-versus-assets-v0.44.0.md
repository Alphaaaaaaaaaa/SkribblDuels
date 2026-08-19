# Profile, Versus and embedded assets v0.44.0

v0.44.0 expands the trusted profile that the Gateway sends to both matched
players. A participant now includes a unique Duel display name, preferred
German/English UI language and one server-authoritative Versus avatar choice.

## One-time database migration

Run `supabase/migrations/202608050001_expand_skribbl_duels_profiles.sql` after
the existing v0.36.0 profile migration. It adds:

- case-insensitive unique Duel display names;
- `de`/`en` language preference;
- Discord or normalized four-part Skribbl avatar selection;
- server-owned special-avatar entitlements;
- an authenticated RPC that updates only the caller's profile.

The OAuth synchronization trigger continues to refresh Discord username and
image but deliberately preserves a custom Duel display name.

## Gateway Contract v4

`WELCOME` and match participants carry the validated profile. This lets the
Versus screen render the opponent's selected Discord image or Skribbl avatar
without trusting browser-supplied matchmaking data. Reconnect snapshots retain
the same profile data.

## Asset build

`npm run generate:icons` validates every registry path and generates an
in-userscript Data-URL map. The release therefore has no runtime dependency on
skribbl.io paths or third-party image hosting. GIF and PNG are supported; the
supplied `instalike.png` and `my-eyes-are-bleeding.png` remain unchanged.
