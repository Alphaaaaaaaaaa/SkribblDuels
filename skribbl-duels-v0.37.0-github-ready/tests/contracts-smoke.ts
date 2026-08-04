import {
  TELEMETRY_CONTRACT_VERSION,
  isTelemetryEventOf,
  type TelemetryEvent
} from '@skribbl-duels/telemetry-contracts';

export function consumeTelemetry(event: TelemetryEvent): string {
  if (isTelemetryEventOf(event, 'CORRECT_GUESS')) {
    return `${event.actor?.name ?? 'unknown'}:${event.payload.position ?? '-'}`;
  }

  if (isTelemetryEventOf(event, 'SCORE_CHANGED')) {
    return String(event.payload.totalScore ?? 0);
  }

  return event.type;
}

void TELEMETRY_CONTRACT_VERSION;
