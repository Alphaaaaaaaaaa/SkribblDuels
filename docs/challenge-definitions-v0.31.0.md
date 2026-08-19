# Challenge definitions v0.31.0

## Spamguessing

- ID: `spamguessing`
- Sandbox instance: `sandbox-field-spamguessing`
- Public lobbies only.
- Starts from a foreign `ROUND_STARTED` event with a known `wordLengths` array.
- The expected letter count is the sum of all displayed word-part lengths.
- A qualifying attempt must:
  - be an own `GUESS_SUBMITTED` event in the same drawing turn;
  - exactly match an entry in the active official language word list;
  - have the same normalized letter count as the target word;
  - belong to the same rapid burst as the other qualifying attempts.
- The default burst requires at least three attempts within 2500 ms.
- Completion only occurs when Skribbl confirms packet 32 as `SPAM_DETECTED` after that valid burst.
- Short filler words cannot qualify against a longer target.

## Autodraw detected!

- ID: `autodraw-detected`
- Sandbox instance: `sandbox-field-autodraw-detected`
- Load an `.skd` file and paste the loaded command sequence during an own public drawing turn.
- New telemetry events:
  - `TYPO_SKD_FILE_LOADED`
  - `TYPO_SKD_PASTED`
- The default fallback:
  1. observes `.skd` file selection, including detached file inputs opened through `HTMLInputElement.click()`;
  2. parses and fingerprints the selected draw-command sequence;
  3. watches live-only `DRAW_COMMAND_BATCH_SUBMITTED` events;
  4. recognizes the exact sequence even when Typo sends it across multiple batches;
  5. emits `TYPO_SKD_PASTED` only after the loaded sequence was matched.
- A direct Typo relay is also supported. See `examples/typo-autodraw-relay-integration.ts`.
- A direct relay paste can complete when the challenge was activated after the file-load event, because the relay itself confirms `loadedFromFile: true`.
