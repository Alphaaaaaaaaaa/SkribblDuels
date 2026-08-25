# Repository audit — v0.55.0

## Result

The deployable runtime has one userscript source, one generated userscript,
one Gateway entry point and one active migration chain. No `.env`, service-role
key, Redis credential, operations token, `node_modules`, build output or local
deployment state belongs in the release archive.

## Cleanup performed

- Removed the duplicate `tests/all-starter-v30-runtime.ts`; its assertions and
  fixture were already covered by `tests/all-starter-runtime.ts` in the same
  test command.
- Removed the obsolete duplicate `fixtures/sniper-strict-reset-v4.fixture.json`;
  the retained canonical file is
  `fixtures/starter-challenges-with-sniper-strict-reset-v4.fixture.json`.
- Kept the versioned v28/v29 fixtures and historical challenge documents. They
  are intentional regression/history assets and are not loaded by production.
- Kept the fallback build/test scripts. They are manual recovery tools and are
  not part of Railway startup.

## Deployment boundaries

- Railway runs only `dist/gateway/index.js` through `start:gateway`.
- `apps/gateway/.env` is optional locally and intentionally absent on Railway;
  Railway-injected variables are authoritative.
- Supabase migrations are ordered and additive. The latest required migration
  is `202608210001_create_gateway_abuse_controls.sql`.
- The complete-source archive excludes `.git`, `.env*` secrets, `node_modules`,
  `dist` and prior `deliverables`, but includes source, icons, tests, docs,
  migrations, operations rules, lockfile and generated installable userscript.

## Verification gates

- TypeScript no-emit typecheck;
- all runtime, fixture, security, migration and UI tests;
- userscript build and metadata round-trip;
- Gateway production bundle;
- `git diff --check` and archive-content inspection.

