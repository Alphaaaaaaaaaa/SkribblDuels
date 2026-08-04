# Challenge definitions v0.24.0

## One Line v2

The local player must be the drawer, use exactly one real pointer-correlated pencil stroke and have every eligible player from the start-of-turn roster guess the word. Players who join later are not required. Players who leave are removed from the required set. Fill, clear, undo, unknown drawing commands or a second real stroke disqualify the turn.

## Monochromism v2

Every eligible start-of-turn player must guess the drawing. The drawer may use exactly one non-white color family and must use every color ID belonging to that family. For example, the red family requires both Red and Dark Red; the green family requires all three green shades. White remains permitted as an eraser. A second family or an unknown color disqualifies the turn.

## Made you squint!

This challenge replaces White Privileges. Every eligible start-of-turn player must guess while the correct-guess canvas snapshot reports at least `0.99` white ratio. A player whose snapshot is below the threshold cannot qualify again in the same turn. Later joiners are not required and leavers are removed from the required set.

## Separation goal

The replay fixture deliberately uses separate turns:

1. one stroke plus all guessers, but an incomplete color family;
2. all colors of one family plus all guessers, but multiple strokes;
3. all guessers at 99% white, but multiple strokes and an incomplete color family.

This verifies that the challenges do not automatically complete one another.
