# @skribbl-duels/telemetry-replay

Creates versioned JSON fixtures from normalized telemetry and replays them through the same `TelemetryProvider` interface used by the future Challenge Engine.

## Core API

```ts
createTelemetryFixture(events, options)
createFixtureFromProvider(provider, options)
validateTelemetryFixture(value)
parseTelemetryFixture(json)
new TelemetryReplayProvider()
```

Default fixtures omit high-volume draw batches. Dedicated drawing fixtures may opt in later.

Replay modes:

- instant
- realtime
- scaled
- manual step
