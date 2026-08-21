# Pair Draft and Parity Final v0.41.0

## Authoritative selection model

Gateway Contract v2 replaces the full-pool picker with a server-authoritative
pair draft. Every active 15-second turn contains exactly two challenge IDs.
Both IDs are compatible with the already selected fields, supported by both
clients and leave a valid path to a complete board.

Offers are category-aware. The Gateway prefers challenges from the least
represented categories and uses two different categories whenever the
remaining pool permits it. The server random source selects entries and offer
order; the browser cannot request a challenge outside the current pair.

An unselected offer may appear in a later pair. This is required for Ranked:
24 player decisions expose 48 option positions while the frozen pool contains
46 challenges.

## Equal player influence

Casual contains eight player selections followed by one server-random field.
Each participant therefore chooses four fields. Ranked contains 24 player
selections followed by one server-random field, giving each participant twelve
choices.

After the last player selection, the draft enters `finalizing`. The Gateway:

1. computes every compatible remaining candidate;
2. chooses the final ID server-side with category balancing;
3. publishes the candidate IDs and one absolute reveal timestamp, but not the
   chosen ID;
4. reveals the authoritative final pick after 3.2 seconds;
5. validates the immutable board and starts the existing 10-second countdown.

The UI may animate the published candidate set like a slot reel, but it cannot
influence or predict the authoritative result.

## Incremental board

The board is visible from the beginning of the draft. It starts with nine or
25 empty square fields. Each accepted player or timeout pick fills the next
field. During `finalizing`, only the next field animates; after the reveal it is
replaced by the server-selected challenge.

Board and field backgrounds use `var(--COLOR_PANEL_BG)` with a fallback for
non-standard Skribbl themes. Fields use a 1:1 aspect ratio, four-pixel corner
radius and no numbered labels. Challenge icon containers expose a stable
`data-challenge-id` until the immutable icon registry is populated.

## Ready acceptance

The ready action is one-way for this ready check. A first click sends
`READY_SET(true)`, immediately disables the button and displays a pending
state. A confirmed snapshot changes it to `Accepted`. Cancelling the match
remains a separate action; the acceptance button no longer toggles back to
false and therefore cannot require a second click.

## Verification

- Contract guards cover selecting, finalizing and complete draft snapshots.
- Casual proves four selections per player and one server-random ninth field.
- Timeout selection remains server-authoritative.
- 250 complete Ranked pair-draft seeds prove two-option turns, 25 distinct
  fields, valid boards and at least four represented categories.
- Blind Guess and Drunk Vision remain mutually exclusive; Deaf Guess remains
  compatible with either one.

