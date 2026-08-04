# Challenge definitions v0.23.0

## One Line

A local public drawing turn is eligible after a real pointer interaction produces its first outgoing pencil command. Empty clicks do not count. A second valid stroke, fill command, unknown draw command, clear or undo disqualifies that turn. The challenge completes when another player correctly guesses while exactly one valid stroke has been observed. The stroke may still be held when the guess arrives.

## Monochromism

The eligible guessers are the non-drawer players present at `ROUND_STARTED`. Later joiners are not required. Players who leave are removed from the required set, but leaving alone never triggers completion. White is treated as erasing and does not create another color family. Every non-white pencil/fill command must belong to one single color family. The final required player must produce a `CORRECT_GUESS` for completion.

## White Privileges

When another player correctly guesses the local drawer, telemetry reads the actual backing canvas. Transparent pixels and RGB channels >= 250 are treated as white. The challenge completes at `whiteRatio >= 0.95`. Canvas sampling failure produces no event and therefore no false completion.
