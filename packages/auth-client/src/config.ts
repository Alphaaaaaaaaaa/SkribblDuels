declare const __SKRIBBL_DUELS_SUPABASE_URL__: string | undefined;
declare const __SKRIBBL_DUELS_SUPABASE_PUBLISHABLE_KEY__: string | undefined;
declare const __SKRIBBL_DUELS_SUPABASE_AUTH_REDIRECT_URL__: string | undefined;

function configuredValue(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export const SUPABASE_PROJECT_URL = configuredValue(
  typeof __SKRIBBL_DUELS_SUPABASE_URL__ === 'string'
    ? __SKRIBBL_DUELS_SUPABASE_URL__
    : undefined,
  'https://kryznzijjlqkixdxqkft.supabase.co'
);
export const SUPABASE_PUBLISHABLE_KEY = configuredValue(
  typeof __SKRIBBL_DUELS_SUPABASE_PUBLISHABLE_KEY__ === 'string'
    ? __SKRIBBL_DUELS_SUPABASE_PUBLISHABLE_KEY__
    : undefined,
  'sb_publishable_6SOSKRreA8lHr-7aRZsq6w_361QcD9J'
);
export const SUPABASE_AUTH_REDIRECT_URL = configuredValue(
  typeof __SKRIBBL_DUELS_SUPABASE_AUTH_REDIRECT_URL__ === 'string'
    ? __SKRIBBL_DUELS_SUPABASE_AUTH_REDIRECT_URL__
    : undefined,
  'https://skribbl.io/'
);
export const SUPABASE_AUTH_STORAGE_KEY = 'skribblDuelsSupabaseAuthV1';
