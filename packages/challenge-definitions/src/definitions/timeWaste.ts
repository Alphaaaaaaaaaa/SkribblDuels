import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface TimeWasteParameters {
  seconds: number;
}

export interface TimeWasteState {
  qualifyingEvents: number;
  roundSessionId: string | null;
  drawerId: number | null;
  whiteDurationMs: number;
}

export const timeWasteDefinition: ChallengeDefinition<TimeWasteState, TimeWasteParameters> = {
  id: 'time-waste',
  version: 2,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      'Time Waste',
      'Witness another drawer keep the canvas completely white for 50 continuous seconds in a public lobby.',
      'Time Waste',
      'Erlebe, wie ein anderer Zeichner die Leinwand in einer öffentlichen Lobby 50 Sekunden durchgehend vollständig weiß lässt.'
    ),
    icon: 'time-waste-hourglass',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    seconds: 50
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    roundSessionId: null,
    drawerId: null,
    whiteDurationMs: 0
  }),
  validateParameters(value): value is TimeWasteParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<TimeWasteParameters>).seconds);
  },
  relevantEvents: ['CANVAS_METRICS'],
  allowedLobbyTypes: [0],
  reduce({ event, parameters }) {
    if (event.type !== 'CANVAS_METRICS') return null;
    if (event.context.roundSessionId === null || event.context.drawerId === null) return null;
    if (event.context.meId === null || event.context.drawerId === event.context.meId) return null;
    if (event.payload.trigger !== 'continuous-white-duration') return null;

    const whiteDurationMs = event.payload.whiteDurationMs ?? 0;
    const requiredMs = parameters.seconds * 1000;
    if (event.payload.nonWhitePixels !== 0 || event.payload.whiteRatio < 1 || whiteDurationMs < requiredMs) {
      return null;
    }

    return {
      internalState: {
        qualifyingEvents: 1,
        roundSessionId: event.context.roundSessionId,
        drawerId: event.context.drawerId,
        whiteDurationMs
      },
      progress: 1,
      complete: true,
      reason: 'time-waste-foreign-canvas-remained-white',
      evidenceEventIds: [event.eventId]
    };
  }
};
