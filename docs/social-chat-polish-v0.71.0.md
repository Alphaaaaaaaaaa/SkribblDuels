# Friends and Quick Messages — v0.71.0

Requires Gateway v0.13.0, client package v0.12.0 and Gateway Contract 18.
The 53 Challenges, board sizes, rating rules and Duel timers stay unchanged.

## Upgrade from v0.70.0

1. Apply `supabase/migrations/202610010003_social_lobby_join_permissions.sql`
   after the three existing Social migrations. It adds a constrained
   `lobby_join_mode` column and updates the privileged health probe to 18.
2. Deploy the included Gateway with the existing Railway environment. No new
   environment variable is needed. `/readyz` must report `socialHealthy: true`.
3. Install `Skribbl-Duels-v0.71.0.user.js` and refresh both clients.

Gateway and userscript must use the same contract. Contract 17 clients cannot
connect to Contract 18. Existing friendships, pins, privacy, profile statuses,
chat history and unread markers are preserved.

## Lobby permission

“Allow friends to join your lobby” now offers these values:

| Setting | Public lobby | Private lobby |
| --- | --- | --- |
| Public | Allow | Disable |
| Private | Allow | Allow |
| None | Disable | Disable |

Existing enabled settings become Public; disabled settings become None.
Private joining is opt-in. Lobby visibility and visible availability still
apply. The Gateway discloses a join ID only to current friends whose permission
allows joining; otherwise it can show the permitted lobby details with a null
ID. A known lobby ID is required even when permission allows joining.

The locked overlay covers the viewport from its first frame and animates only
opacity. The soft glow comes from a radial background, with no filter on the
GIF. Pin controls appear only in the Friends modal. Pinned friends still sort
first in the floating list, whose horizontal overflow is contained.

## Message presentation

Outgoing rows receive stable local display timestamps and tie-breakers when
created. Server confirmations update their stored IDs, timestamps and status
without changing those display positions. Consecutive messages from one sender
share a background and one name until the other sender replies or the gap is
more than two minutes. An invitation uses its own card. Pending indicators do
not insert an extra line that would disappear on confirmation.

Quick Messages show a Unicode-aware character count while the input is not
empty. The limit remains 300 code points. Emoji insertion, typing, submission
and reopening a draft update the counter. Only messages consisting entirely
of registered emojis and whitespace use the larger emoji size.

HTTP(S) and www links open in a separate tab, retain the message text and use
`var(--COLOR_PANEL_BORDER_FOCUS)` for their underline. Quick Messages, private
Duel chat, its native-chat mirror and observed game-chat lines share the safe
text-node renderer. Native author and WPM/time nodes are preserved. Arbitrary
HTML and executable URL schemes are never inserted as markup or links.

## Emoji picker

All 34 uploaded additions are included. `res/friend-system/emoji-groups.json`
is the ordered source for the 132 picker entries, aliases and category labels:
Emotions, Skribbl Tools, Collectibles, Skribbl Hats, Food, Other, Objects,
Symbols, Hotkeys. Its source mappings resolve original case-sensitive paths.

The picker inserts the requested short codes. The two best-score codes retain
the path names specified in the map. The six duplicate icons are absent from
the picker, while their original codes can still render historical messages.
All previous path-based codes also remain readable. Assets are embedded in the
userscript and require no GitHub request while chatting.

The picker sits 10px above the composer. Ctrl+E toggles it while the Quick
Messages input is focused; its capture handler cancels the browser default and
suppresses game shortcuts and key repeats. Shift-click inserts an emoji and
keeps the picker open. The Slimy button remains available for browser or OS
shortcuts that are reserved before a page receives the keyboard event.

## Duel invitations

Quick Messages show incoming and sent Duel invitations. Incoming cards offer
Accept and Deny; responding disables both until the Gateway replies. Both
accounts receive accepted, denied, cancelled and expired status events.
Replacing an invitation cancels the earlier card. The creator's ordinary
invite-link actions also update the Social card through Match Authority.

Actions use `FRIEND_MATCH_INVITE_RESPOND` and the existing single-use invite
authority. The client receives the invite ID and expiry, without receiving or
storing its opaque token. Client timers disable expired cards immediately;
the server still checks the actual invite. Recoverable failures permit retry,
while unavailable invitations lose their actions.

Active invitations replay after reconnect within the running Gateway. Locally
cached waiting cards become unavailable after a connection loss or reload until
the Gateway confirms that they are still active. Invitation cards are browser
presentation history; the 24-hour cross-browser database history continues to
store ordinary friend messages. No invitation-history table was added.

## Verification and rollback

Use Node 24 and run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
`npm run test:v071` checks rapid sends with reversed/delayed confirmations,
group breaks, keyboard cancellation, Shift-click, Unicode counters, invitation
responses/errors/expiry, private join dispatch and the lock overlay. It also
verifies every embedded emoji against its source file, old aliases, safe URLs
and live native/Typo chat nodes. A real local PostgreSQL runtime tests migration
reapplication, opt-out preservation, revisions, database constraints, role
permissions and the Contract 18 readiness probe. The Social service tests cover
all six lobby-mode/type combinations and invitation replay/status delivery.

These checks run locally. A live two-account Supabase/Railway smoke test remains
an operator step after deployment; no production configuration is changed by
the ZIP build.

To roll back to v0.70.0, deploy its Gateway/userscript together and restore the
probe definition from `202610010002_add_friend_chat_history.sql` to return 17.
The additive column may remain. Keep `allow_lobby_join` and `lobby_join_mode`
consistent if editing old preferences during a rollback, before upgrading again.
