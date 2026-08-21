import { combineLatest, type Observable, type Subscription } from 'rxjs';
import type { TelemetryStats } from '@skribbl-duels/telemetry-contracts';
import type {
  ChallengeEngine,
  ChallengeEngineStats
} from '@skribbl-duels/challenge-engine';
import {
  createTelemetryFixture,
  parseTelemetryFixture,
  type ReplayState,
  type TelemetryReplayProvider
} from '@skribbl-duels/telemetry-replay';
import {
  filterDecodedRecords,
  filterRawRecords,
  selectEstimatedServerTime,
  type CanonicalLobbyState,
  type IndexedDbRawPacketStore,
  type LobbyStateStats,
  type LobbyStateStore,
  type PacketExportOptions,
  type ProtocolDecoder,
  type ProtocolStats,
  type RawPacketRecorder,
  type RecorderStats,
  type RelayStatus,
  type TelemetryStore
} from '@skribbl-duels/telemetry-core';

interface PanelOptions {
  runtimeId: string;
  recorder: RawPacketRecorder;
  decoder: ProtocolDecoder;
  lobbyStore: LobbyStateStore;
  telemetryStore: TelemetryStore;
  replayProvider: TelemetryReplayProvider;
  challengeEngine: ChallengeEngine;
  challengeSource$: Observable<'live' | 'replay' | 'detached'>;
  useChallengeLive(): void;
  useChallengeReplay(): void;
  detachChallengeSource(): void;
  activateStarterChallenges(): unknown;
  deactivateStarterChallenges(): number;
  store: IndexedDbRawPacketStore;
  incomingStatus$: import('rxjs').Observable<RelayStatus>;
  outgoingStatus$: import('rxjs').Observable<RelayStatus>;
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function button(text: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.style.cssText = [
    'border:1px solid rgba(255,255,255,.2)',
    'border-radius:5px',
    'background:rgba(255,255,255,.1)',
    'color:white',
    'padding:4px 7px',
    'cursor:pointer',
    'font:11px Consolas,monospace'
  ].join(';');
  element.addEventListener('click', () => {
    Promise.resolve(onClick()).catch(error => {
      console.error('[Skribbl Duels Inspector] Panel action failed', error);
      alert(error instanceof Error ? error.message : String(error));
    });
  });
  return element;
}

function statusMark(status: RelayStatus): string {
  return status.connected ? 'connected' : 'waiting';
}

function playerName(state: CanonicalLobbyState, playerId: number | null): string {
  if (playerId === null) return '-';
  return state.users[String(playerId)]?.name ?? `#${playerId}`;
}

function exportOptions(includeDrawPackets: boolean): PacketExportOptions {
  return { includeDrawPackets };
}

export class DebugPanel {
  private root: HTMLDivElement | null = null;
  private body: HTMLPreElement | null = null;
  private controls: HTMLDivElement | null = null;
  private subscription: Subscription | null = null;
  private mountGuardId: number | null = null;
  private collapsed = false;
  private visible = true;
  private includeDrawPackets = false;

  public constructor(private readonly options: PanelOptions) {}

  public mount(): void {
    this.ensureMounted();

    if (this.mountGuardId === null) {
      this.mountGuardId = window.setInterval(() => {
        this.ensureMounted();
      }, 500);
    }
  }

  public ensureMounted(): void {
    const target = document.body ?? document.documentElement;

    if (!target) {
      window.setTimeout(() => this.ensureMounted(), 50);
      return;
    }

    if (!this.root) this.createPanel();
    if (!this.root) return;

    if (!this.root.isConnected || this.root.parentElement !== target) {
      target.appendChild(this.root);
    }

    this.root.style.display = this.visible ? 'block' : 'none';
  }

  public isMounted(): boolean {
    return Boolean(this.root?.isConnected);
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.ensureMounted();
  }

  public destroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;

    if (this.mountGuardId !== null) {
      window.clearInterval(this.mountGuardId);
      this.mountGuardId = null;
    }

    this.root?.remove();
    this.root = null;
    this.body = null;
    this.controls = null;
  }

  private createPanel(): void {
    const root = document.createElement('div');
    root.id = 'scd-raw-recorder-panel';
    root.dataset.scdRawRecorder = 'panel';
    root.dataset.scdRuntimeId = this.options.runtimeId;
    root.style.cssText = [
      'all:initial',
      'display:block',
      'position:fixed',
      'right:10px',
      'bottom:10px',
      'z-index:2147483647',
      'width:430px',
      'box-sizing:border-box',
      'background:rgba(11,13,18,.94)',
      'border:1px solid rgba(255,255,255,.18)',
      'border-radius:8px',
      'box-shadow:0 8px 28px rgba(0,0,0,.45)',
      'color:white',
      'font:12px/1.35 Consolas,monospace',
      'user-select:none',
      'pointer-events:auto'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;gap:6px;align-items:center;padding:7px;border-bottom:1px solid rgba(255,255,255,.12);box-sizing:border-box';

    const title = document.createElement('strong');
    title.textContent = 'Skribbl Duels Telemetry Inspector';
    title.style.cssText = 'flex:1;color:white;font:700 13px/1.35 Consolas,monospace';

    const collapse = button('–', () => {
      this.collapsed = !this.collapsed;
      if (this.body) this.body.style.display = this.collapsed ? 'none' : 'block';
      if (this.controls) this.controls.style.display = this.collapsed ? 'none' : 'flex';
      collapse.textContent = this.collapsed ? '+' : '–';
    });

    header.append(title, collapse);

    const body = document.createElement('pre');
    body.style.cssText = 'display:block;margin:0;padding:8px;white-space:pre-wrap;max-height:350px;overflow:auto;user-select:text;color:white;background:transparent;font:12px/1.35 Consolas,monospace;box-sizing:border-box';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:7px;border-top:1px solid rgba(255,255,255,.12);box-sizing:border-box';

    const fixtureInput = document.createElement('input');
    fixtureInput.type = 'file';
    fixtureInput.accept = 'application/json,.json';
    fixtureInput.style.display = 'none';
    fixtureInput.addEventListener('change', async () => {
      const file = fixtureInput.files?.[0];
      fixtureInput.value = '';
      if (!file) return;
      const validation = parseTelemetryFixture(await file.text());
      if (!validation.valid || !validation.fixture) {
        alert(`Invalid telemetry fixture:\n${validation.issues.join('\n')}`);
        return;
      }
      this.options.replayProvider.load(validation.fixture);
    });

    const drawToggleLabel = document.createElement('label');
    drawToggleLabel.style.cssText = 'display:flex;gap:4px;align-items:center;color:white;font:11px Consolas,monospace;cursor:pointer';
    const drawToggle = document.createElement('input');
    drawToggle.type = 'checkbox';
    drawToggle.checked = false;
    drawToggle.addEventListener('change', () => {
      this.includeDrawPackets = drawToggle.checked;
    });
    const drawText = document.createElement('span');
    drawText.textContent = 'include draw #19';
    drawToggleLabel.append(drawToggle, drawText);

    controls.append(
      button('Export raw', async () => {
        await this.options.recorder.flushPending();
        const allRecords = await this.options.store.getSessionRecords(
          this.options.recorder.getSessionId()
        );
        const filtered = filterRawRecords(allRecords, exportOptions(this.includeDrawPackets));
        downloadJson({
          exportedAt: Date.now(),
          sessionId: this.options.recorder.getSessionId(),
          filter: filtered.summary,
          records: filtered.records
        }, `scd-raw-session-${Date.now()}.json`);
      }),
      button('Export decoded', async () => {
        await this.options.recorder.flushPending();
        const rawRecords = await this.options.store.getSessionRecords(
          this.options.recorder.getSessionId()
        );
        const decoded = this.options.decoder.decodeMany(rawRecords);
        const filtered = filterDecodedRecords(decoded, exportOptions(this.includeDrawPackets));
        downloadJson({
          exportedAt: Date.now(),
          sessionId: this.options.recorder.getSessionId(),
          filter: filtered.summary,
          decodedRecords: filtered.records
        }, `scd-decoded-session-${Date.now()}.json`);
      }),
      button('Export both', async () => {
        await this.options.recorder.flushPending();
        const allRecords = await this.options.store.getSessionRecords(
          this.options.recorder.getSessionId()
        );
        const rawFiltered = filterRawRecords(allRecords, exportOptions(this.includeDrawPackets));
        const decodedFiltered = filterDecodedRecords(
          this.options.decoder.decodeMany(allRecords),
          exportOptions(this.includeDrawPackets)
        );
        downloadJson({
          exportedAt: Date.now(),
          sessionId: this.options.recorder.getSessionId(),
          filter: rawFiltered.summary,
          lobbyState: this.options.lobbyStore.getSnapshot(),
          recentStateChanges: this.options.lobbyStore.getRecentChanges(),
          records: rawFiltered.records,
          decodedRecords: decodedFiltered.records
        }, `scd-protocol-session-${Date.now()}.json`);
      }),
      button('Export state', () => {
        downloadJson({
          exportedAt: Date.now(),
          sessionId: this.options.recorder.getSessionId(),
          lobbyState: this.options.lobbyStore.getSnapshot(),
          stateStats: this.options.lobbyStore.getStats(),
          recentStateChanges: this.options.lobbyStore.getRecentChanges()
        }, `scd-lobby-state-${Date.now()}.json`);
      }),
      button('Export telemetry', () => {
        downloadJson({
          sessionId: this.options.recorder.getSessionId(),
          ...(this.options.telemetryStore.exportSnapshot() as Record<string, unknown>)
        }, `scd-telemetry-${Date.now()}.json`);
      }),
      button('Export fixture', () => {
        const fixture = createTelemetryFixture(
          this.options.telemetryStore.getRecent(),
          {
            name: `Skribbl Duels session ${this.options.recorder.getSessionId()}`,
            description: 'Captured by the Skribbl Duels Telemetry Inspector.',
            source: 'live-session',
            tags: ['inspector-export']
          }
        );
        downloadJson(fixture, `scd-fixture-${Date.now()}.json`);
      }),
      button('Load fixture', () => fixtureInput.click()),
      button('Play ×10', async () => {
        await this.options.replayProvider.play({
          mode: 'scaled',
          speed: 10,
          timestampMode: 'preserve',
          restartFromBeginning: true
        });
      }),
      button('Step', () => {
        this.options.replayProvider.step(1);
      }),
      button('Stop replay', () => {
        this.options.replayProvider.stop();
      }),
      button('Challenges live', () => {
        this.options.useChallengeLive();
      }),
      button('Challenges replay', () => {
        this.options.useChallengeReplay();
      }),
      button('Challenges detach', () => {
        this.options.detachChallengeSource();
      }),
      button('Activate starter', () => {
        this.options.activateStarterChallenges();
      }),
      button('Remove starter', () => {
        this.options.deactivateStarterChallenges();
      }),
      button('Export challenges', () => {
        downloadJson(
          this.options.challengeEngine.exportSnapshot(),
          `skribbl-duels-challenges-${Date.now()}.json`
        );
      }),
      button('Reset challenges', () => {
        if (!confirm('Reset all local challenge-engine instances?')) return;
        this.options.challengeEngine.reset('inspector-reset');
      }),
      fixtureInput,
      drawToggleLabel,
      button('Clear', async () => {
        if (!confirm('Delete all recorded SCD raw socket data?')) return;
        await this.options.store.clearAll();
      })
    );

    root.append(header, body, controls);

    this.root = root;
    this.body = body;
    this.controls = controls;

    if (!this.subscription) {
      this.subscription = combineLatest([
        this.options.incomingStatus$,
        this.options.outgoingStatus$,
        this.options.recorder.stats$,
        this.options.decoder.stats$,
        this.options.lobbyStore.state$,
        this.options.lobbyStore.stats$,
        this.options.telemetryStore.stats$,
        this.options.replayProvider.state$,
        this.options.challengeEngine.stats$,
        this.options.challengeSource$
      ]).subscribe(([
        incoming,
        outgoing,
        recorderStats,
        protocolStats,
        lobbyState,
        lobbyStats,
        telemetryStats,
        replayState,
        challengeStats,
        challengeSource
      ]) => {
        this.render(
          incoming,
          outgoing,
          recorderStats,
          protocolStats,
          lobbyState,
          lobbyStats,
          telemetryStats,
          replayState,
          challengeStats,
          challengeSource
        );
      });
    }
  }

  private render(
    incoming: RelayStatus,
    outgoing: RelayStatus,
    recorderStats: RecorderStats,
    protocolStats: ProtocolStats,
    lobbyState: CanonicalLobbyState,
    lobbyStats: LobbyStateStats,
    telemetryStats: TelemetryStats,
    replayState: ReplayState,
    challengeStats: ChallengeEngineStats,
    challengeSource: 'live' | 'replay' | 'detached'
  ): void {
    if (!this.body) return;

    const raw = recorderStats.lastRecord;
    const decoded = protocolStats.lastRecord?.decoded ?? null;
    const lastRaw = raw
      ? `${raw.direction} event=${raw.socketEvent ?? '-'} id=${raw.packetId ?? '-'}`
      : '-';
    const lastDecoded = decoded
      ? `${decoded.kind}${decoded.issues.length ? ` · issues=${decoded.issues.length}` : ''}`
      : '-';
    const me = playerName(lobbyState, lobbyState.meId);
    const drawer = playerName(lobbyState, lobbyState.game.drawerId);
    const maxRounds = typeof lobbyState.settings[3] === 'number' ? lobbyState.settings[3] : null;
    const roundLabel = lobbyState.round === null
      ? '-'
      : maxRounds === null
        ? String(lobbyState.round)
        : `${lobbyState.round}/${maxRounds}`;
    const word = lobbyState.game.word ?? (
      lobbyState.game.wordLengths
        ? `[${lobbyState.game.wordLengths.join(', ')}]`
        : '-'
    );

    this.body.textContent = [
      `Incoming: ${statusMark(incoming)} · ${incoming.messageCount}`,
      `Outgoing: ${statusMark(outgoing)} · ${outgoing.messageCount}`,
      `Session:  ${recorderStats.sessionId}`,
      `Raw:      ${recorderStats.total} (${recorderStats.incoming} in / ${recorderStats.outgoing} out)`,
      `Decoded:  ${protocolStats.known} known / ${protocolStats.unknown} unknown`,
      `Issues:   ${protocolStats.withIssues}`,
      `Draw #19: ${recorderStats.drawPackets} · export ${this.includeDrawPackets ? 'included' : 'omitted'}`,
      `DB errors:${recorderStats.storageErrors}`,
      '',
      `Lobby:    ${lobbyState.lobbyId ?? '-'} · gen ${lobbyState.lobbyGeneration} · ${lobbyState.languageName ?? '-'}`,
      `Players:  ${lobbyState.userOrder.length} · me ${me} (#${lobbyState.meId ?? '-'})`,
      `Game:     ${lobbyState.game.stateName} · time ${selectEstimatedServerTime(lobbyState)?.toFixed(1) ?? '-'} · round ${roundLabel}`,
      `Drawer:   ${drawer}`,
      `Word:     ${word}`,
      `Guesses:  ${lobbyState.game.guessOrder.length} · first ${playerName(lobbyState, lobbyState.game.firstGuesserId)}`,
      `Canvas:   ${lobbyState.game.drawCommandCount} commands / ${lobbyState.game.drawPacketCount} packets · clear ${lobbyState.game.clearCount} · undo ${lobbyState.game.undoCount}`,
      `State:    ${lobbyStats.appliedRecords} records · ${lobbyStats.meaningfulChanges} changes`,
      `Telemetry:${telemetryStats.total} events · ${telemetryStats.retained} retained · ${telemetryStats.omittedHighVolume} draw omitted`,
      `Replay:   ${replayState.status} · ${replayState.currentIndex}/${replayState.totalEvents} · ${replayState.fixtureName ?? '-'}`,
      `Challenges:${challengeStats.registeredDefinitions} defs · ${challengeStats.active} active · ${challengeStats.completionPending} pending · ${challengeStats.claimed} claimed`,
      `Ch source: ${challengeSource} · processed ${challengeStats.processedTelemetryEvents} · dup ${challengeStats.duplicateTelemetryEvents}`,
      `Last chg: ${lobbyStats.lastChange?.kind ?? '-'}`,
      `Last c.e: ${challengeStats.lastEngineEvent?.type ?? '-'}`,
      `Last evt: ${telemetryStats.lastEvent?.type ?? '-'}`,
      '',
      `Last raw: ${lastRaw}`,
      `Last type:${lastDecoded}`
    ].join('\n');
  }
}
