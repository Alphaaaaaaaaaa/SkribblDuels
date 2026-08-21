# 3D introduction, avatar renderer and countdown v0.45.0

## Introduction

The homepage button still opens one four-second introduction per browser
session. The center graphic is the embedded `skribbl-duels-logo.gif`. Two orbit
definitions use different X/Y/Z rotations, different radii and opposite travel
directions. They are therefore non-coplanar.

Each frame projects the orbit point through a perspective camera. The same
depth value controls icon scale, opacity and z-index. Negative-depth icons use
a layer below the logo; positive-depth icons use a layer above it. Every intro
selects nine distinct Challenge assets from the registry and gives them small
random phase, speed, size and spin variations while keeping every icon on its
orbit.

## Challenge assets

The generated asset module now exports both Data URLs and a Challenge-ID to
asset-path map. Draft options, drafted fields, parity animation and the live
board all resolve through this map. Challenge IDs remain independent from
filenames and stored match state.

Drafted fields no longer receive a self/opponent color based on the selecting
player. Those colors remain reserved for pending or confirmed ownership during
the running Duel.

## Countdown

The Gateway remains authoritative for the ten-second deadline. During the last
five seconds, the UI displays the supplied number GIF for one drop cycle. At
the deadline, `countdown_G.gif`, `countdown_O.gif` and
`countdown_ExclamationMark.gif` form `GO!`. The short visual tail crosses the
Gateway `running` transition without delaying local telemetry activation.

## Skribbl avatar

The Versus renderer uses the four normalized avatar values in this order:
color, eyes, mouth and special. Each official atlas contains ten columns, so a
sprite index uses:

```text
x = -(index % 10) * 100%
y = -floor(index / 10) * 100%
```

All layers use `background-size: 1000% 100%`; Special keeps Skribbl's larger
166% layer box. Discord avatars remain ordinary profile images.

## Profile and chat

The new incremental migration enforces `^[A-Za-z0-9]{3,24}$` in the database
and in the authenticated update function. The browser uses the same rule and
shows bold leave-colored feedback directly below the input in English or
German. Match and chat names are read from authoritative Duel participants.

Enter submits a Duel-chat message and restores focus to the replacement input;
Escape deliberately blurs it. A finished match appends one owner-colored game
chat line with the winner's Duel name and elapsed `hh:mm:ss` duration.
