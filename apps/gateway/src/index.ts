import { createSupabaseGatewayAuthenticator } from './authenticate';
import { readGatewayServerConfig } from './config';
import { createGatewayServer } from './server';

const config = readGatewayServerConfig();
const gateway = createGatewayServer({
  config,
  authenticate: createSupabaseGatewayAuthenticator(config)
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
