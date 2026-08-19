import { createSupabaseGatewayAuthenticator } from './authenticate';
import { readGatewayServerConfig } from './config';
import { createGatewayServer } from './server';
import { prepareGatewayOfficialWordLists } from './officialWordListAuthority';
import { SupabaseGatewayMatchAuthorityPersistence } from './matchPersistence';

const config = readGatewayServerConfig();
await prepareGatewayOfficialWordLists();
const persistence = config.supabaseServiceRoleKey
  ? new SupabaseGatewayMatchAuthorityPersistence(config.supabaseUrl, config.supabaseServiceRoleKey)
  : null;
const gateway = createGatewayServer({
  config,
  authenticate: createSupabaseGatewayAuthenticator(config),
  ...(persistence ? { persistence } : {})
});

const port = await gateway.listen();
console.info('[Skribbl Duels Gateway] Listening', {
  port,
  environment: config.nodeEnv,
  clientOrigin: config.clientOrigin,
  simulatedMatchmaking: config.simulatedPlayersEnabled
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
