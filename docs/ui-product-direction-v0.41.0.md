# Skribbl Duels UI and Account Direction

This document records the approved product direction supplied with the
v0.39.0/v0.40.0 live feedback. It separates architecture-sensitive behavior
from visual details that can still change safely later.

## Homepage entry and introduction

- Inject one full-width `Skribbl Duels` button below Skribbl's Play and Create
  buttons. Center the 40×40 animated logo and label as one row.
- The first open in a page session shows the pixelated logo at roughly 360×360,
  floating vertically with a soft white glow.
- Challenge icons orbit horizontally with per-icon angle offsets. Depth order
  changes as icons pass behind or in front of the logo.
- After four seconds the logo pulses once, collapses and hands off to the Hub.
- Respect reduced-motion preferences and provide a fast subsequent-open path.

## Vanilla-style Hub shell

- Present the Hub as a Skribbl-style modal, initially on `Duels`.
- Do not show Match or Chat navigation before a match exists.
- Once a match starts, replace the Duels content with one Match view that also
  contains Duel chat.
- Put Settings at the top right as the Skribbl settings GIF button. Put the
  About GIF icon immediately beside it instead of keeping an About tab.
- Remove Product Foundation and Draft Compatibility copy from the normal Duels
  view. About/Help explains the five- and thirteen-field win targets.

## Duels actions

- Casual 3×3 and Ranked 5×5 queue buttons share one row with a gap. Casual uses
  Create-button styling; Ranked uses Play-button styling.
- During queueing, rotate one localized challenge name and definition every ten
  seconds.
- Keep `Authenticated Gateway`, connected identity and a small Reconnect action
  below the primary controls.
- Add Friendly matchmaking with an invite input, Join button, and Create flow
  that selects Casual or Ranked. Generated invite tokens are copied
  automatically and may also be revealed explicitly.
- Friendly invite tokens must be opaque, expiring and single-purpose. The
  Gateway remains authoritative for creation, joining and invalidation.

## Account model that must precede Versus UI

The UI does not need or display email. Supabase Auth may retain email metadata
internally, but Skribbl Duels profile behavior uses:

- immutable account ID;
- Discord user ID and current Discord username;
- unique/custom Duel display name, for example Discord `analphabetism` and Duel
  name `Alpha`;
- preferred language: German or English;
- avatar source: Discord image or saved Skribbl avatar;
- normalized Skribbl color, eyes, mouth and optional special sprite positions;
- server-controlled entitlement for allowed special sprites.

Special avatar parts are never trusted from arbitrary browser markup. The
profile stores an allowed asset identifier, and the Gateway/database policy
checks an entitlement or allowlist before returning it. The saved avatar
snapshot is shown to the opponent on the Versus screen after matchmaking.

## Match and chat behavior

- A found match opens a Versus screen using each participant's selected Discord
  image or saved Skribbl avatar.
- Duel chat is part of the Match view. While its input is focused, capture and
  stop Enter and relevant hotkey events before Skribbl's chat or game handlers
  receive them.
- Confirmed challenge completions continue to appear in the game chat and may
  play a completion sound effect.
- Settings contain independent toggles for completion messages, completion SFX
  and challenge names.

## Board and challenge icon assets

- Board and fields use `var(--COLOR_PANEL_BG)`, no visible borders or field box
  shadows, 1:1 fields and four-pixel corner radius.
- Active fields use `transition: transform .15s` and scale to `0.9` on hover.
- Challenge names appear under icons and remain toggleable.
- Result text uses `Self · score:score · Opponent`; the win target is explained
  in About/Help rather than repeated in the score line.
- Tooltips wrap at no more than 50 characters per line.

Challenge icons use an immutable registry keyed by challenge ID, for example
`challenge-icons/<challenge-id>.gif` plus a generated manifest containing
content hashes and dimensions. The release build should embed small GIF
assets as data URLs in the userscript or publish hash-addressed files from a
versioned repository release. Imgur links are suitable as design references,
not as runtime dependencies for competitive UI.

The initial complete path template is stored at
`challenge-icons/registry.template.json`. It also reserves logo, Settings,
About and `5, 4, 3, 2, 1, G, O, !` countdown GIF paths.

## Safe implementation order

1. v0.41.0: pair draft, incremental board, one-click ready, server-random final
   slot and tooltip wrapping.
2. v0.42.0: reconnect continuity, stable centered draft, arrow selection,
   lobby-series reset and complete GIF asset template.
3. v0.43.0: homepage button, intro animation, vanilla modal Hub, dynamic
   navigation, queue controls and settings/about icons.
4. v0.44.0: profile migration, custom display name, language, avatar source,
   special entitlements, Versus screen and localized queue facts.
5. v0.45.0: Friendly invite lifecycle and Match-integrated private chat.
6. v0.46.0: supplied challenge GIF integration, completion SFX and final responsive
   visual polish.

Layout, color values, animation timing and supplied icon artwork remain safe to
iterate later. Profile fields, authorization rules, invite states and match-tab
lifecycle should follow this document before persistence and Versus UI expand.
