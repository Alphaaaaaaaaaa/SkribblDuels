import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import { LEAVE_REASON_NAMES } from '@skribbl-duels/telemetry-core';

const SAFE_HOME_EVENT_TYPES = new Set<TelemetryEvent['type']>([
  'AVATAR_RANDOMIZED',
  'LOGO_AVATAR_CLICKED',
  'SPECIAL_AVATAR_FOUND'
]);

const SAFE_LEAVE_REASONS = new Set(Object.values(LEAVE_REASON_NAMES));

/**
 * DOM visibility can be forged from DevTools. The latest accepted Telemetry
 * event therefore also has to describe either an untouched homepage, a benign
 * homepage interaction, or the local player's confirmed lobby departure.
 */
export function isHomepageTelemetryEligible(lastEvent: TelemetryEvent | null): boolean {
  if (lastEvent === null) return true;
  if (SAFE_HOME_EVENT_TYPES.has(lastEvent.type)) return true;
  if (lastEvent.type !== 'PLAYER_LEFT' || lastEvent.actor?.isSelf !== true) return false;
  return typeof lastEvent.payload.reasonName === 'string'
    && SAFE_LEAVE_REASONS.has(lastEvent.payload.reasonName);
}
