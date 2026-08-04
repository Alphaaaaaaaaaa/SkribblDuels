import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface AutodrawDetectedState {
  loadedEventIdsByFingerprint: Record<string, string>;
  loadedFileNamesByFingerprint: Record<string, string>;
  pastedFingerprint: string | null;
  pastedFileName: string | null;
  commandCount: number | null;
}

export const autodrawDetectedDefinition: ChallengeDefinition<AutodrawDetectedState, Record<string, never>> = {
  id: 'autodraw-detected',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Autodraw detected!',
      'Load an .skd file and use it during your drawing turn.',
      'Autodraw detected!',
      'Lade eine .skd-Datei und nutze sie während deines Zeichen-Turns.'
    ),
    icon: 'autodraw-skd-file',
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {},
  target: () => 1,
  createInitialState: () => ({
    loadedEventIdsByFingerprint: {},
    loadedFileNamesByFingerprint: {},
    pastedFingerprint: null,
    pastedFileName: null,
    commandCount: null
  }),
  relevantEvents: ['TYPO_SKD_FILE_LOADED', 'TYPO_SKD_PASTED'],
  reduce({ event, runtime }) {
    if (event.type === 'TYPO_SKD_FILE_LOADED') {
      return {
        internalState: {
          ...runtime.internalState,
          loadedEventIdsByFingerprint: {
            ...runtime.internalState.loadedEventIdsByFingerprint,
            [event.payload.fingerprint]: event.eventId
          },
          loadedFileNamesByFingerprint: {
            ...runtime.internalState.loadedFileNamesByFingerprint,
            [event.payload.fingerprint]: event.payload.fileName
          }
        },
        reason: 'skd-file-loaded',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'TYPO_SKD_PASTED') return null;
    if (!event.payload.loadedFromFile) return null;
    if (event.context.lobbyType !== 0) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    const loadEventId = runtime.internalState.loadedEventIdsByFingerprint[event.payload.fingerprint];
    const fileName = event.payload.fileName
      ?? runtime.internalState.loadedFileNamesByFingerprint[event.payload.fingerprint]
      ?? null;
    return {
      internalState: {
        ...runtime.internalState,
        pastedFingerprint: event.payload.fingerprint,
        pastedFileName: fileName,
        commandCount: event.payload.commandCount
      },
      progress: 1,
      complete: true,
      reason: 'loaded-skd-file-pasted-during-own-drawing',
      evidenceEventIds: loadEventId ? [loadEventId, event.eventId] : [event.eventId]
    };
  }
};
