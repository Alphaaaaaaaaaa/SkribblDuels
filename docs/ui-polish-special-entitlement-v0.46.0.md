# UI polish and Special entitlement v0.46.0

## Introduction refinements

The two non-coplanar 3D definitions now use 238/166 and 222/152 orbit radii.
Seven icons travel on the first plane and six on the second, for thirteen
distinct Challenge assets per introduction. Perspective position, scale,
opacity and the front/behind logo layer still derive from the same projected
3D point.

The SVG track renderer and its dashed paths were removed. The orbit is now
communicated only by the denser moving icon field, avoiding a flat line that
cannot share the logo's depth transition. The logo glow is exactly:

```css
filter: drop-shadow(0 0 7px rgba(255,255,255,.2))
        drop-shadow(0 0 14px rgba(255,255,255,.1));
```

Animated, ready-state, board and homepage-button icons use transparent
`drop-shadow(3px 3px 0 rgba(0,0,0,.25))` treatment. This represents Skribbl's
usual 135-degree light direction without shadowing the asset's transparent
bounding box.

## Font, control sizing and pointer isolation

The Product UI no longer declares Arial. It inherits the font already supplied
by skribbl.io. The Duel display-name field uses `width:auto`, `min-width:0`,
`max-width:100%` and flexible remaining-space sizing so it cannot escape its
container.

Every generated button, input, select and textarea explicitly receives
`pointer-events:auto`. Pointer, mouse, touch, context-menu and wheel events are
stopped at the control after reaching it, so normal control behavior remains
available while bubbling does not activate Skribbl page handlers. The rule
also covers the Duel-chat input and submit button.

## Personal Special grant

`supabase/admin/grant-analphabetism-special.sql` is an idempotent owner action
for profile `c27ea4b9-984e-4efb-bfba-e9f77b28f1f4`. It verifies that the
profile exists, inserts the protected `analphabetism-special` entitlement and
sets that same entitlement as the active profile reference in one transaction.

The entitlement ID is an opaque permission. It does not select a sprite. The
fourth value in the normalized Skribbl avatar continues to select the Special
atlas position. After the SQL runs, reconnect the Userscript and save the
current Skribbl avatar from Settings. No service-role key or other secret is
stored in the repository or Userscript.
