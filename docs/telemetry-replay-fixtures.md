# Telemetry Replay and Fixtures

## Purpose

The replay package separates challenge testing from live skribbl.io games. A challenge can consume either the live telemetry provider or a replay provider because both implement the same `TelemetryProvider` contract.

```text
Live Typo relay -> Telemetry Core -> Challenge Engine
Fixture JSON    -> Replay Provider -> Challenge Engine
```

## Fixture format

A fixture contains ordered normalized telemetry events and their relative timing. Raw socket packets, selectors and canonical lobby state internals are not part of this format.

```ts
interface TelemetryFixture {
  fixtureVersion: 1;
  metadata: {
    fixtureId: string;
    name: string;
    contractVersion: '1.0.0';
    schemaVersion: 1;
    eventCount: number;
    durationMs: number;
    eventTypes: TelemetryEventType[];
  };
  events: Array<{
    offsetMs: number;
    event: TelemetryEvent;
  }>;
}
```

## Draw telemetry

High-volume `DRAW_COMMAND_BATCH` events are omitted by default. This keeps ordinary guessing, score, chat and lobby fixtures compact. A dedicated drawing fixture may opt in to high-volume events later.

## Replay modes

- `instant`: emit every fixture event synchronously in deterministic order.
- `realtime`: preserve the original event delays.
- `scaled`: preserve relative delays but divide them by a speed factor.
- `step`: manually emit one or more events without a running timer.

## Timestamp modes

- `preserve`: retain the timestamps stored in the fixture. Best for deterministic tests.
- `rebase`: move fixture timestamps to the current replay start while preserving relative time.

## Inspector workflow

1. Play the desired situation in skribbl.io.
2. Select **Export fixture** in the Telemetry Inspector.
3. Keep the JSON under `fixtures/` with a descriptive name.
4. Select **Load fixture** to validate it.
5. Use **Play ×10** or **Step** to replay it.

The replay stream is exposed separately as `window.skribblDuelsReplay`; replay events do not enter or modify the live Telemetry Core.
