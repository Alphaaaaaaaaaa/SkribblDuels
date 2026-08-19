declare const __SKRIBBL_DUELS_GATEWAY_URL__: string | undefined;

function configuredValue(value: string | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value.trim().replace(/\/+$/, '');
}

export const GATEWAY_URL = configuredValue(
  typeof __SKRIBBL_DUELS_GATEWAY_URL__ === 'string'
    ? __SKRIBBL_DUELS_GATEWAY_URL__
    : undefined
);
