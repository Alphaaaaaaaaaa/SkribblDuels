# Generic Challenge Engine v0.1

## Separation

The Challenge Engine consumes only the versioned `TelemetryProvider` contract. The telemetry inspector is one development app; the final Skribbl Duels userscript will bundle the telemetry core and challenge engine without mounting the inspector panel.

## Runtime identity

A challenge definition and an active board field are separate concepts:

```text
challengeId = quickscope
instanceId  = match-123-field-7
```

The same definition may exist in different matches, but a board should activate it at most once.

## Reducer model

Each active instance has:

- parameters
- opaque internal state
- numeric progress and target
- status
- revision
- stable lifecycle context
- optional completion candidate

Definitions are pure reducers over normalized telemetry. Returning `null` means no semantic change.

## Completion flow

The local engine never awards a field directly:

```text
Telemetry event
  -> challenge progress reaches target
  -> CHALLENGE_COMPLETION_CANDIDATE
  -> match server atomically decides
  -> claimed / lost / reopen
```

A candidate includes the trigger telemetry ID and evidence IDs for later plausibility checks.

## Lifecycle resets

Definitions may reset on:

- `lobby-change`
- `game-change`
- `round-change`

Definition-specific failures, such as breaking a first-guesser streak, use a reducer result with `reset: true`.

## Public-lobby eligibility

Most current challenges will use:

```ts
allowedLobbyTypes: [0]
```

`Owner of the Lobby` will use private-lobby events instead.

## Replay debugging

The inspector can switch the engine input between live telemetry and the replay provider. A fixture therefore exercises the exact same challenge reducer as a live match.

## Persistence

The engine snapshot stores runtime state and a bounded list of recently processed telemetry event IDs. Definitions must be registered before `restore()` is called. Instances whose definition is absent or has a different version are skipped safely.
