# Chat, Rematch and repository audit — v0.54.2

## Duel Chat spam authority

`packages/gateway-contracts/src/chatSpam.ts` is the single policy source for
the browser preview and authoritative Matchmaker. The score matches the
observed Skribbl behavior:

- less than 100 ms since the accepted message: add three;
- less than 900 ms: add one;
- after two idle seconds: subtract four, never below zero;
- tolerance score: three; kick boundary: six;
- block while the score is above four and the 900 ms interval is active.

The Gateway still keeps its broad per-connection flood limit, but
`DUEL_CHAT_SEND` no longer has a competing fixed account window. Idempotent
retries are resolved before scoring. The participant spam state is included in
the existing JSON authority aggregate, with a backward-compatible fallback for
v0.54.1 snapshots; no database migration is required.

The UI stores the current input value outside the rendered DOM. An incoming
Gateway revision can therefore replace the Chat form without erasing text that
was typed after the preceding send. A locally or authoritatively blocked send
keeps its draft and inserts the bold leave-colored Skribbl warning.

## Rematch presentation

The immutable finished snapshot already exposes `rematchReadyAccountIds`.
When only the opponent is ready, the Match Chat derives a request card from
that state, including the authoritative profile/avatar and a Rematch button.
The duplicate result-card button is omitted until the request is resolved. A
new request can also use the existing optional Match Chat toast path; clicking
it opens and focuses Match Chat.

## Source audit and packaging

The audited workspace is configured with
`https://github.com/Alphaaaaaaaaaa/SkribblDuels.git` as `origin`. Runtime source
imports resolve to one implementation each. The apparent duplicate package
`tsconfig.json` files are intentional workspace boundaries and must stay.

Cleanup applied:

- removed `fixtures/sniper-strict-reset-v4.fixture.json`, which was byte-for-
  byte identical to the documented
  `fixtures/starter-challenges-with-sniper-strict-reset-v4.fixture.json`;
- ignored `deliverables/`, because historical ZIP/userscript copies are release
  outputs and add deployment weight without participating in the Railway build;
- retained `userscript/skribbl-duels-telemetry-inspector.user.js` as the one
  intentional installable artifact;
- retained historical docs and non-duplicate fixtures because they document
  versioned behavior and feed regression certification, while remaining
  completely outside the production runtime graph;
- kept `dist/`, `node_modules/`, secrets and local `.env` files excluded;
- replaced the fake Redis credential in `apps/gateway/.env.example` with an
  empty optional development value and corrected the obsolete “future
  Gateway” root environment comment.

The complete-source release archive contains source, migrations, operations
rules, docs, fixtures, tests, icons and the installable userscript. It excludes
`.git`, `node_modules`, `dist`, `deliverables`, local environment files, logs,
coverage and editor metadata.
