# @skribbl-duels/challenge-engine

Generic, telemetry-driven runtime for Skribbl Duels challenges.

The package imports only `@skribbl-duels/telemetry-contracts`. It has no knowledge of:

- Typo relays
- skribbl packet IDs
- DOM selectors
- the protocol decoder
- the lobby reducer
- the inspector UI

## Responsibilities

- register versioned challenge definitions
- activate one runtime instance per board field
- process live or replay telemetry
- deduplicate telemetry event IDs
- manage numeric progress and internal challenge state
- reset on lobby, game or round boundaries
- emit completion candidates instead of awarding fields locally
- resolve server claims as claimed, lost or reopened
- persist and restore runtime snapshots

## Status lifecycle

```text
inactive
  -> active
  -> completion-pending
  -> claimed | lost | active (reopen)

active -> expired
```

## Minimal definition

```ts
const definition: ChallengeDefinition<{ count: number }, { amount: number }> = {
  id: 'example-counter',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: {
      en: { name: 'Example', description: 'Count self guesses.' }
    },
    rankedEligible: false,
    difficulty: 1
  },
  defaultParameters: { amount: 3 },
  target: parameters => parameters.amount,
  createInitialState: () => ({ count: 0 }),
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    if (event.type !== 'CORRECT_GUESS' || !event.actor?.isSelf) return null;
    const count = runtime.internalState.count + 1;
    return { internalState: { count }, progress: count };
  }
};
```
