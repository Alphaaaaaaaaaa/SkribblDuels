import type {
  ChallengeEngineSnapshot,
  ChallengePersistenceAdapter
} from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryChallengePersistence implements ChallengePersistenceAdapter {
  private snapshot: ChallengeEngineSnapshot | null = null;

  public async load(): Promise<ChallengeEngineSnapshot | null> {
    return this.snapshot ? clone(this.snapshot) : null;
  }

  public async save(snapshot: ChallengeEngineSnapshot): Promise<void> {
    this.snapshot = clone(snapshot);
  }

  public async clear(): Promise<void> {
    this.snapshot = null;
  }
}

export class LocalStorageChallengePersistence implements ChallengePersistenceAdapter {
  public constructor(
    private readonly storageKey = 'skribblDuelsChallengeEngineV1',
    private readonly storage: Storage = localStorage
  ) {}

  public async load(): Promise<ChallengeEngineSnapshot | null> {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return clone(parsed as ChallengeEngineSnapshot);
  }

  public async save(snapshot: ChallengeEngineSnapshot): Promise<void> {
    this.storage.setItem(this.storageKey, JSON.stringify(snapshot));
  }

  public async clear(): Promise<void> {
    this.storage.removeItem(this.storageKey);
  }
}
