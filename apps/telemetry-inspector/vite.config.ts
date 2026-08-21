import { defineConfig, loadEnv } from 'vite';
import monkey from 'vite-plugin-monkey';

export const defaultPublicConfig = {
  supabaseUrl: 'https://kryznzijjlqkixdxqkft.supabase.co',
  supabasePublishableKey: 'sb_publishable_6SOSKRreA8lHr-7aRZsq6w_361QcD9J',
  supabaseAuthRedirectUrl: 'https://skribbl.io/',
  gatewayUrl: 'https://skribblduels-production.up.railway.app'
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const publicConfig = {
    supabaseUrl: env.VITE_SUPABASE_URL?.trim() || defaultPublicConfig.supabaseUrl,
    supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
      || defaultPublicConfig.supabasePublishableKey,
    supabaseAuthRedirectUrl: env.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim()
      || defaultPublicConfig.supabaseAuthRedirectUrl,
    gatewayUrl: env.VITE_GATEWAY_URL?.trim() || defaultPublicConfig.gatewayUrl
  };

  return {
    define: {
      __SKRIBBL_DUELS_SUPABASE_URL__: JSON.stringify(publicConfig.supabaseUrl),
      __SKRIBBL_DUELS_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publicConfig.supabasePublishableKey),
      __SKRIBBL_DUELS_SUPABASE_AUTH_REDIRECT_URL__: JSON.stringify(publicConfig.supabaseAuthRedirectUrl),
      __SKRIBBL_DUELS_GATEWAY_URL__: JSON.stringify(publicConfig.gatewayUrl)
    },
    plugins: [
      monkey({
        entry: 'apps/telemetry-inspector/src/userscript.ts',
        userscript: {
          name: 'Skribbl Duels',
          namespace: 'https://github.com/skribbl-duels',
          version: '0.54.2',
          description: 'Gateway-backed Skribbl Duels with durable Challenges, authoritative matches and invite links.',
          author: 'Alpha',
          icon: 'https://raw.githubusercontent.com/Alphaaaaaaaaaa/SkribblDuels/main/challenge-icons/skribbl-duels-logo.gif',
          match: ['https://skribbl.io/*'],
          grant: 'none',
          'run-at': 'document-start'
        },
        build: {
          fileName: 'skribbl-duels-telemetry-inspector.user.js',
          systemjs: 'inline'
        }
      })
    ],
    build: {
      target: 'es2022',
      sourcemap: true,
      outDir: 'dist/telemetry-inspector',
      emptyOutDir: true
    }
  };
});
