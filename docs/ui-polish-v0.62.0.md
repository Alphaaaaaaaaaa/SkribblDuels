# UI, Profile and Chat Hardening — v0.62.0

## Scope

v0.62.0 continues directly from the v0.61.0 native-chat settings release. It
does not change Gateway Contract v11, telemetry schemas, Supabase storage or
Railway configuration. The Gateway must nevertheless be rebuilt because the
server-authoritative Ranked pool now admits `Ate and left no crumbs` v3.

## Profile presentation

- A successful `Save profile` updates the saved display name and color in all
  Duel-owned UI immediately. The temporary presentation override remains
  authoritative while the authenticated Gateway reconnect publishes the new
  identity.
- Existing private Match Chat entries are recolored and own message authors are
  renamed. Account summary, Profile, Versus, Draft/countdown scores, board
  Claim colors and result views are rerendered from the same effective value.
- Native mirrored Match Chat and Challenge-completion rows intentionally retain
  Skribbl's native chat colors.
- A Profile status tooltip is registered only on the ellipsized status label
  and appears only when `scrollWidth` exceeds `clientWidth`. Its body is the
  unmodified complete status and contains no label or icon description.
- The status text limit sits below the input. Cancel uses the shared danger
  palette. The reset control clears both local status fields and uses the
  reserved `stat-icons/trash.gif` asset or the visible `🗑` fallback.

## Chat and timing

- WPM suffixes use `var(--COLOR_CHAT_TEXT_GUESSCHAT)`.
- A `ROUND_STARTED` boundary alone is insufficient for Guess Time. The client
  must observe `DRAWING_STARTED` for the same lobby/game/round key.
- The First Guesser stores the sole delta baseline. Position 2 and every later
  position subtract that baseline, so `5.520s`, `+529ms`, `+11.593s` cannot
  drift into previous-Guesser deltas.
- A later Guess without an observed First-Guesser baseline fails closed for
  Guess Time while an independently certified WPM suffix may still render.
- Every keydown originating in the private Duel input is stopped before global
  Skribbl handlers. Focus intent, draft, selection and scroll survive
  authoritative panel rerenders.

## Modal and queue behavior

- Queue and Invite transitions into a new Match close the Hub and all nested
  Profile, status-detail and color-picker overlays before Versus appears.
- The queued card uses `/img/load.gif` at 48 px with the native 0.8-second
  rotation rhythm. Reduced-motion preference disables rotation.
- Coverage language and table-sort actions replace only the existing Profile
  detail body. The overlay is retained, its opening animation is not replayed
  and body scroll position is restored after layout.
- Profile stat cards use `var(--COLOR_PANEL_BG)`. Coverage cards inherit the
  blue View-all button base and the selected language uses the green Ranked
  action palette.

## Verification and deployment

The release gate includes icon generation, TypeScript, dedicated v0.62 UI
contracts, chat-stat correlation tests, Challenge reducer tests, the complete
repository suite, seeded Ranked drafts, Gateway replay, both production builds
and release-archive roundtrip verification.

Deployment order:

1. Deploy the v0.62.0 Gateway and verify `/readyz`.
2. Run a two-client queue and Invite smoke test.
3. Distribute the v0.62.0 userscript.

No migration or new environment variable is required.
