import { createSupabaseGatewayAuthenticator } from './authenticate';
import { readGatewayServerConfig } from './config';
import { createGatewayServer } from './server';
import { prepareGatewayOfficialWordLists } from './officialWordListAuthority';
import { SupabaseGatewayMatchAuthorityPersistence } from './matchPersistence';
import { GatewayRealtimeInfrastructure } from './realtimeInfrastructure';

const config = readGatewayServerConfig();
const wordListAuthority = await prepareGatewayOfficialWordLists();
const persistence = config.supabaseServiceRoleKey
  ? new SupabaseGatewayMatchAuthorityPersistence(config.supabaseUrl, config.supabaseServiceRoleKey)
  : null;
const realtime = config.redisUrl
  ? await GatewayRealtimeInfrastructure.connect(config.redisUrl, config.instanceId, config.authorityLeaseMs)
  : null;
const gateway = createGatewayServer({
  config,
  authenticate: createSupabaseGatewayAuthenticator(config),
  ...(persistence ? { persistence } : {}),
  ...(realtime ? { realtime } : {})
});

const port = await gateway.listen();
console.info('[Skribbl Duels Gateway] Listening', {
  port,
  environment: config.nodeEnv,
  clientOrigin: config.clientOrigin,
  simulatedMatchmaking: config.simulatedPlayersEnabled,
  realtime: realtime ? 'redis-streams' : 'single-instance',
  instanceId: config.instanceId,
  authoritativeWordLists: wordListAuthority.ready.map(status => status.languageName),
  unsupportedWordLists: wordListAuthority.unsupported.map(status => status.languageName)
});

let closing = false;
const close = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await gateway.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
