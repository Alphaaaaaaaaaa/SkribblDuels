import { randomUUID } from 'node:crypto';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { createClient } from 'redis';

export interface GatewayRealtimeStatus {
  enabled: boolean;
  healthy: boolean;
  mode: 'single-instance' | 'redis-streams';
  instanceId: string;
  authorityRole: 'leader' | 'follower' | 'unavailable';
  leaderInstanceId: string | null;
  error: string | null;
}

export interface GatewayRealtimeCommand {
  commandId: string;
  sentAt: number;
  payload: unknown;
}

export interface GatewayRedisCommandClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

type RoleHandler = (leader: boolean) => Promise<void>;
type CommandHandler = (command: GatewayRealtimeCommand) => Promise<void>;

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  if redis.call('GET', KEYS[2]) == ARGV[1] then
    redis.call('PEXPIRE', KEYS[2], ARGV[2])
  end
  return 1
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  if redis.call('GET', KEYS[2]) == ARGV[1] then
    redis.call('DEL', KEYS[2])
  end
  return 1
end
return 0
`;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function leaseInstanceId(value: string | null): string | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  return separator < 1 ? null : value.slice(0, separator);
}

function validCommand(value: unknown): value is GatewayRealtimeCommand {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<GatewayRealtimeCommand>;
  return typeof candidate.commandId === 'string'
    && candidate.commandId.length > 0
    && candidate.commandId.length <= 160
    && typeof candidate.sentAt === 'number'
    && Number.isFinite(candidate.sentAt)
    && 'payload' in candidate;
}

export class GatewayRealtimeInfrastructure {
  private readonly adapterClient;
  private readonly commandClient;
  private readonly subscriberClient;
  private readonly leaseValue: string;
  private readonly leaseKey = 'skd:v1:authority:lease';
  private readonly readyKey = 'skd:v1:authority:ready';
  private readonly commandChannel = 'skd:v1:authority:commands';
  private readonly adapterFactory: ReturnType<typeof createAdapter>;
  private roleHandler: RoleHandler | null = null;
  private commandHandler: CommandHandler | null = null;
  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private electionRunning = false;
  private closing = false;
  private leader = false;
  private leaderReady = false;
  private leaderInstanceId: string | null = null;
  private lastError: Error | null = null;

  private constructor(
    redisUrl: string,
    public readonly instanceId: string,
    private readonly leaseMs: number
  ) {
    this.adapterClient = createClient({ url: redisUrl });
    this.commandClient = createClient({ url: redisUrl });
    this.subscriberClient = this.commandClient.duplicate();
    this.leaseValue = `${instanceId}:${randomUUID()}`;
    this.adapterFactory = createAdapter(this.adapterClient, {
      streamName: 'skd:v1:socket.io',
      channelPrefix: 'skd:v1:socket.io',
      sessionKeyPrefix: 'skd:v1:socket-session:',
      maxLen: 20_000,
      onlyPlaintext: true
    });
    for (const client of [this.adapterClient, this.commandClient, this.subscriberClient]) {
      client.on('error', error => {
        this.lastError = error instanceof Error ? error : new Error(String(error));
      });
      client.on('ready', () => {
        this.lastError = null;
      });
    }
  }

  public static async connect(redisUrl: string, instanceId: string, leaseMs: number): Promise<GatewayRealtimeInfrastructure> {
    const realtime = new GatewayRealtimeInfrastructure(redisUrl, instanceId, leaseMs);
    await Promise.all([
      realtime.adapterClient.connect(),
      realtime.commandClient.connect(),
      realtime.subscriberClient.connect()
    ]);
    return realtime;
  }

  public adapter(): ReturnType<typeof createAdapter> {
    return this.adapterFactory;
  }

  public rateLimitClient(): GatewayRedisCommandClient {
    return this.commandClient;
  }

  public async start(roleHandler: RoleHandler, commandHandler: CommandHandler): Promise<void> {
    this.roleHandler = roleHandler;
    this.commandHandler = commandHandler;
    await this.subscriberClient.subscribe(this.commandChannel, raw => {
      void this.receiveCommand(raw);
    });
    await this.electionTick();
    const deadline = Date.now() + this.leaseMs;
    while (!this.leaderInstanceId && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      await this.electionTick();
    }
    if (!this.leaderInstanceId) throw new Error('No realtime Match Authority leader is available.');
  }

  public async submit(payload: unknown): Promise<boolean> {
    if (!this.isHealthy() || !this.leaderInstanceId) return false;
    const command: GatewayRealtimeCommand = {
      commandId: randomUUID(),
      sentAt: Date.now(),
      payload
    };
    const subscribers = await this.commandClient.publish(this.commandChannel, JSON.stringify(command));
    if (subscribers === 0) return false;
    const acknowledgementKey = this.acknowledgementKey(command.commandId);
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (await this.commandClient.get(acknowledgementKey) === 'accepted') return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
  }

  public status(): GatewayRealtimeStatus {
    return {
      enabled: true,
      healthy: this.isHealthy() && this.leaderInstanceId !== null && (!this.leader || this.leaderReady),
      mode: 'redis-streams',
      instanceId: this.instanceId,
      authorityRole: !this.leaderInstanceId ? 'unavailable' : this.leader ? 'leader' : 'follower',
      leaderInstanceId: this.leaderInstanceId,
      error: this.lastError?.message ?? null
    };
  }

  public async ping(): Promise<boolean> {
    try {
      const result = await this.commandClient.ping();
      if (result !== 'PONG') throw new Error('Redis did not return PONG.');
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.electionTimer) clearTimeout(this.electionTimer);
    this.electionTimer = null;
    if (this.leader) {
      try {
        await this.commandClient.eval(RELEASE_SCRIPT, {
          keys: [this.leaseKey, this.readyKey],
          arguments: [this.leaseValue]
        });
      } catch {
        // Redis disconnect already makes the lease expire naturally.
      }
    }
    await this.setLeader(false);
    await Promise.allSettled([
      this.subscriberClient.isOpen ? this.subscriberClient.quit() : Promise.resolve(),
      this.commandClient.isOpen ? this.commandClient.quit() : Promise.resolve(),
      this.adapterClient.isOpen ? this.adapterClient.quit() : Promise.resolve()
    ]);
  }

  private isHealthy(): boolean {
    return this.adapterClient.isReady && this.commandClient.isReady && this.subscriberClient.isReady;
  }

  private scheduleElection(): void {
    if (this.closing) return;
    if (this.electionTimer) clearTimeout(this.electionTimer);
    this.electionTimer = setTimeout(() => {
      this.electionTimer = null;
      void this.electionTick();
    }, Math.max(500, Math.floor(this.leaseMs / 3)));
    this.electionTimer.unref?.();
  }

  private async electionTick(): Promise<void> {
    if (this.closing || this.electionRunning) return;
    this.electionRunning = true;
    try {
      if (this.leader) {
        const renewed = Number(await this.commandClient.eval(RENEW_SCRIPT, {
          keys: [this.leaseKey, this.readyKey],
          arguments: [this.leaseValue, String(this.leaseMs)]
        }));
        if (renewed === 1) {
          this.leaderInstanceId = this.instanceId;
          this.lastError = null;
          return;
        }
        await this.setLeader(false);
      }

      const acquired = await this.commandClient.set(this.leaseKey, this.leaseValue, {
        NX: true,
        PX: this.leaseMs
      });
      if (acquired === 'OK') {
        this.leaderInstanceId = this.instanceId;
        await this.setLeader(true);
        this.lastError = null;
        return;
      }
      const [lease, ready] = await Promise.all([
        this.commandClient.get(this.leaseKey),
        this.commandClient.get(this.readyKey)
      ]);
      this.leaderInstanceId = ready === lease ? leaseInstanceId(lease) : null;
      this.lastError = null;
    } catch (error) {
      this.lastError = new Error(`Redis authority coordination failed: ${errorText(error)}`);
      this.leaderInstanceId = null;
      await this.setLeader(false);
    } finally {
      this.electionRunning = false;
      this.scheduleElection();
    }
  }

  private async setLeader(next: boolean): Promise<void> {
    if (this.leader === next) return;
    this.leader = next;
    this.leaderReady = false;
    if (!next && this.leaderInstanceId === this.instanceId) this.leaderInstanceId = null;
    await this.roleHandler?.(next);
    if (next) {
      await this.commandClient.set(this.readyKey, this.leaseValue, { PX: this.leaseMs });
      this.leaderReady = true;
    }
  }

  private async receiveCommand(raw: string): Promise<void> {
    if (!this.leader || !this.leaderReady || !this.commandHandler || this.closing) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!validCommand(parsed)) return;
      if (Math.abs(Date.now() - parsed.sentAt) > 30_000) return;
      const renewed = Number(await this.commandClient.eval(RENEW_SCRIPT, {
        keys: [this.leaseKey, this.readyKey],
        arguments: [this.leaseValue, String(this.leaseMs)]
      }));
      if (renewed !== 1) {
        await this.setLeader(false);
        return;
      }
      await this.commandHandler(parsed);
      await this.commandClient.set(this.acknowledgementKey(parsed.commandId), 'accepted', { PX: 5_000 });
    } catch (error) {
      this.lastError = new Error(`Realtime command processing failed: ${errorText(error)}`);
    }
  }

  private acknowledgementKey(commandId: string): string {
    return `skd:v1:authority:ack:${commandId}`;
  }
}
