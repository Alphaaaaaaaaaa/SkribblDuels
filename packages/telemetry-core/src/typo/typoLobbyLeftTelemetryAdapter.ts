import type { TelemetryStore } from '../telemetry/telemetryStore';

export const TYPO_LOBBY_LEFT_DOM_EVENT_NAME = 'leftLobby';

/** Bridges Typo's public LobbyLeftEvent DOM signal into the versioned Contract. */
export class TypoLobbyLeftTelemetryAdapter {
  private started = false;
  private lastEmissionAt = 0;

  public constructor(private readonly telemetryStore: TelemetryStore) {}

  public start(): void {
    if (this.started || typeof document === 'undefined') return;
    document.addEventListener(TYPO_LOBBY_LEFT_DOM_EVENT_NAME, this.handleLobbyLeft, true);
    this.started = true;
  }

  public stop(): void {
    if (!this.started || typeof document === 'undefined') return;
    document.removeEventListener(TYPO_LOBBY_LEFT_DOM_EVENT_NAME, this.handleLobbyLeft, true);
    this.started = false;
  }

  private readonly handleLobbyLeft = (): void => {
    const now = Date.now();
    if (now - this.lastEmissionAt < 250) return;
    this.lastEmissionAt = now;
    this.telemetryStore.emitDomEvent('TYPO_LOBBY_LEFT', {
      method: 'typo-dom-event'
    }, { confidence: 'confirmed' });
  };
}
