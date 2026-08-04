import {
  BehaviorSubject,
  Subject,
  type Observable,
  type Subscription
} from 'rxjs';
import type { DecodedSocketRecord } from '../protocol/types';
import {
  createEmptyLobbyState,
  type CanonicalLobbyState,
  type LobbyStateChange,
  type LobbyStateStats
} from './lobbyState';
import { reduceLobbyState } from './lobbyReducer';

export class LobbyStateStore {
  private currentState = createEmptyLobbyState();
  private readonly stateSubject = new BehaviorSubject<CanonicalLobbyState>(this.currentState);
  private readonly changesSubject = new Subject<LobbyStateChange>();
  private readonly statsSubject = new BehaviorSubject<LobbyStateStats>({
    appliedRecords: 0,
    meaningfulChanges: 0,
    hydrations: 0,
    lobbyChanges: 0,
    drawPacketsApplied: 0,
    lastChange: null
  });
  private readonly recentChanges: LobbyStateChange[] = [];
  private readonly subscription: Subscription;
  private drawEmitTimer: number | null = null;

  public readonly state$: Observable<CanonicalLobbyState> = this.stateSubject.asObservable();
  public readonly changes$: Observable<LobbyStateChange> = this.changesSubject.asObservable();
  public readonly stats$: Observable<LobbyStateStats> = this.statsSubject.asObservable();

  public constructor(
    decoded$: Observable<DecodedSocketRecord>,
    private readonly maxRecentChanges = 200
  ) {
    this.subscription = decoded$.subscribe(record => this.apply(record));
  }

  public getSnapshot(): CanonicalLobbyState {
    return structuredClone(this.currentState);
  }

  public getStats(): LobbyStateStats {
    return { ...this.statsSubject.value };
  }

  public getRecentChanges(): LobbyStateChange[] {
    return this.recentChanges.map(change => structuredClone(change));
  }

  public destroy(): void {
    this.subscription.unsubscribe();
    if (this.drawEmitTimer !== null) window.clearTimeout(this.drawEmitTimer);
    this.stateSubject.complete();
    this.changesSubject.complete();
    this.statsSubject.complete();
  }

  private apply(record: DecodedSocketRecord): void {
    const result = reduceLobbyState(this.currentState, record);
    this.currentState = result.state;

    const previousStats = this.statsSubject.value;
    let lastChange = previousStats.lastChange;
    let hydrations = previousStats.hydrations;
    let lobbyChanges = previousStats.lobbyChanges;

    for (const change of result.changes) {
      lastChange = change;
      if (change.kind === 'LOBBY_HYDRATED') hydrations += 1;
      if (change.kind === 'LOBBY_CHANGED') lobbyChanges += 1;

      this.recentChanges.unshift(change);
      if (this.recentChanges.length > this.maxRecentChanges) {
        this.recentChanges.length = this.maxRecentChanges;
      }
      this.changesSubject.next(change);
    }

    this.statsSubject.next({
      appliedRecords: previousStats.appliedRecords + 1,
      meaningfulChanges: previousStats.meaningfulChanges + result.changes.length,
      hydrations,
      lobbyChanges,
      drawPacketsApplied: previousStats.drawPacketsApplied + (result.drawOnly ? 1 : 0),
      lastChange
    });

    if (result.drawOnly) {
      this.scheduleDrawStateEmission();
    } else {
      this.emitStateNow();
    }
  }

  private scheduleDrawStateEmission(): void {
    if (this.drawEmitTimer !== null) return;
    this.drawEmitTimer = window.setTimeout(() => {
      this.drawEmitTimer = null;
      this.emitStateNow();
    }, 100);
  }

  private emitStateNow(): void {
    this.stateSubject.next(this.getSnapshot());
  }
}
