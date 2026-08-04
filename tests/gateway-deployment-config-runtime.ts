import * as assert from 'node:assert/strict';
import { defaultPublicConfig } from '../apps/telemetry-inspector/vite.config';

const expectedGatewayUrl = 'https://skribblduels-production.up.railway.app';
const configuredGatewayUrl = new URL(defaultPublicConfig.gatewayUrl);

assert.equal(defaultPublicConfig.gatewayUrl, expectedGatewayUrl);
assert.equal(configuredGatewayUrl.protocol, 'https:');
assert.equal(configuredGatewayUrl.origin, expectedGatewayUrl);
assert.equal(configuredGatewayUrl.pathname, '/');

console.log(JSON.stringify({
  gatewayConfigured: true,
  gatewayUrl: defaultPublicConfig.gatewayUrl,
  transport: 'https'
}, null, 2));
