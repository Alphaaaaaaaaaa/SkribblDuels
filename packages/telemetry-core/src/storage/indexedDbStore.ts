import {
  redactSensitiveRawRecord,
  type RawSocketRecord,
  type RecordingSession
} from '../recorder/rawRecord';

const DB_NAME = 'scdRawSocketRecorder';
const DB_VERSION = 1;
const PACKETS_STORE = 'packets';
const SESSIONS_STORE = 'sessions';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

export class IndexedDbRawPacketStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  public async saveSession(session: RecordingSession): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
    transaction.objectStore(SESSIONS_STORE).put(session);
    await transactionDone(transaction);
  }

  public async addMany(records: readonly RawSocketRecord[]): Promise<void> {
    if (records.length === 0) return;

    const database = await this.open();
    const transaction = database.transaction(PACKETS_STORE, 'readwrite');
    const store = transaction.objectStore(PACKETS_STORE);

    for (const record of records) store.add(record);

    await transactionDone(transaction);
  }

  public async countSession(sessionId: string): Promise<number> {
    const database = await this.open();
    const transaction = database.transaction(PACKETS_STORE, 'readonly');
    const index = transaction.objectStore(PACKETS_STORE).index('sessionId');
    return requestToPromise(index.count(IDBKeyRange.only(sessionId)));
  }

  public async getSessionRecords(sessionId: string): Promise<RawSocketRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(PACKETS_STORE, 'readonly');
    const index = transaction.objectStore(PACKETS_STORE).index('sessionId');
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(sessionId)));
    return records.map(redactSensitiveRawRecord);
  }

  public async getAllRecords(): Promise<RawSocketRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(PACKETS_STORE, 'readonly');
    const records = await requestToPromise(transaction.objectStore(PACKETS_STORE).getAll());
    return records.map(redactSensitiveRawRecord);
  }

  public async redactSensitiveRecords(): Promise<number> {
    const database = await this.open();
    const transaction = database.transaction(PACKETS_STORE, 'readwrite');
    const request = transaction.objectStore(PACKETS_STORE).openCursor();
    let redactedCount = 0;

    const cursorDone = new Promise<void>((resolve, reject) => {
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as RawSocketRecord;
        const safeRecord = redactSensitiveRawRecord(record);
        if (safeRecord !== record) {
          cursor.update(safeRecord);
          redactedCount += 1;
        }
        cursor.continue();
      });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });

    await Promise.all([cursorDone, transactionDone(transaction)]);
    return redactedCount;
  }

  public async getAllSessions(): Promise<RecordingSession[]> {
    const database = await this.open();
    const transaction = database.transaction(SESSIONS_STORE, 'readonly');
    return requestToPromise(transaction.objectStore(SESSIONS_STORE).getAll());
  }

  public async clearAll(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([PACKETS_STORE, SESSIONS_STORE], 'readwrite');
    transaction.objectStore(PACKETS_STORE).clear();
    transaction.objectStore(SESSIONS_STORE).clear();
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.addEventListener('upgradeneeded', () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(PACKETS_STORE)) {
          const packets = database.createObjectStore(PACKETS_STORE, {
            keyPath: 'recordId'
          });
          packets.createIndex('sessionId', 'sessionId', { unique: false });
          packets.createIndex('direction', 'direction', { unique: false });
          packets.createIndex('packetId', 'packetId', { unique: false });
          packets.createIndex('occurredAt', 'occurredAt', { unique: false });
        }

        if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
          database.createObjectStore(SESSIONS_STORE, {
            keyPath: 'sessionId'
          });
        }
      });

      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
      request.addEventListener('blocked', () => {
        reject(new Error('IndexedDB upgrade was blocked by another open tab.'));
      }, { once: true });
    });

    return this.databasePromise;
  }
}
