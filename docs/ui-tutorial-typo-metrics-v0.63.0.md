# Typo-gated matchmaking, tutorial and UI metrics — v0.63.0

v0.63.0 is based on the published v0.62.0 source plus the subsequently
uploaded About placeholders, Contact artwork and Drop Streak icon. It does not
change Gateway Contract v11, authoritative Claim rules, Supabase storage or
Railway configuration.

## Matchmaking availability

Matchmaking actions are exposed only when Typo owns the current Skribbl body.
The detector accepts Typo's loader marker `data-typo_loader="true"` and the
later interceptor marker `data-typo_loaded="true"`. This covers body replacement
and late loader completion without relying on a particular Typo panel or
optional feature.

The gate applies to Casual, Ranked, Invite creation and acceptance, New Match
and Rematch. Existing queues and matches remain visible so a user can leave or
recover them safely. A pending Invite stays unconsumed until Typo becomes
available.

## About and Help tutorial

About now uses a 50/50 desktop layout:

- the left column combines authentication and Gateway authority, summarizes
  both formats and explains Match freeze;
- the right column is a five-page tutorial using the supplied `step1.gif`
  through `step5.gif` placeholders and the normal Skribbl Duels logo;
- pages advance every 3.5 seconds and can be selected by dots or mouse wheel
  without rebuilding the modal, replaying its opening animation or changing
  the outer scroll position;
- the bottom Contact row uses `res/about-icons/contact.gif` and currently shows
  `Discord: analphabetism#0`.

The selected teaching sequence is format-specific first: Casual 3×3, Ranked
5×5, drafting, in-game Challenge claims, and the win target/result animation.
The images can be replaced in place later without changing UI code.

## Input and statistics corrections

The text-input adapter observes a full-selection deletion in `beforeinput`.
That resets the active attempt before the next input event, including the very
short Ctrl+A → Backspace → immediate typing sequence where the empty value can
otherwise be missed by a reactive input surface. Partial corrections remain in
the original attempt and retain their correction count.

Guess time is a lower-is-better metric. `P90 guess time` now reports the value
reached by the fastest 10 percent of samples—the 90th performance percentile.
Typing WPM and Guess WPM remain conventional upper-tail numeric percentiles.
No local-statistics schema migration is needed because only snapshot
aggregation semantics changed.

## Resources and UI isolation

All product-managed artwork now lives below `res/`:

```text
res/
  about-icons/
  challenge-icons/
  sound-effects/
  stat-icons/
```

Generated registries embed the new paths into the userscript. Every supplied
Challenge/stat/About file is present; the four still-reserved sound effects
continue to fail silently until their audio files are supplied.

Wheel events from buttons and form controls now reach the modal scroll guard.
Scrollable children consume them normally; a boundary/no-scroll event is
cancelled before it can move the Skribbl homepage. Visible product modals also
own an explicit document scroll lock, and every product scrollbar uses the
same 14 px `COLOR_PANEL_LO`/`COLOR_PANEL_HI` treatment without hover brightening.

## Verification boundary

The release gate includes TypeScript, the complete regression suite, icon and
sound generation, Userscript/Gateway builds, Ranked draft seeds, archive
integrity and a clean extracted-source roundtrip. The next priority remains the
two-client forced-reconnect matrix for locally completed but unresolved
authoritative Claims in `post-v0.62.0-roadmap.md`.
