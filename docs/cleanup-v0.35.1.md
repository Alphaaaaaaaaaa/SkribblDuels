# Cleanup v0.35.1

## Scope

This release is intentionally limited to maintenance and authentication stability. It does not change challenge rules, board formats, match scoring, or the product UI flow.

## Authentication fix

The former client marked itself as started before the Supabase browser SDK had been found. A failed first attempt therefore prevented later initialization, while the sign-in action required an already-created client.

The client now:

- marks initialization complete only after a browser client and auth subscription exist;
- shares concurrent initialization through one promise;
- leaves a failed SDK lookup retryable;
- lets sign-in and sign-out ensure initialization asynchronously;
- reports the specific initialization error instead of the misleading `Supabase Auth has not initialized yet` message;
- uses the explicit Supabase UMD bundle URL in userscript metadata.

## Reproducibility cleanup

- Root, app, auth package, UI, and userscript versions are synchronized at `0.35.1`.
- Node 24 is documented in `.nvmrc` and `package.json`.
- Official Node type definitions replace the incomplete local Node stub.
- Frozen challenge-count assertions use the current 46-challenge pool.
- `.gitignore` protects dependencies, generated output, logs, and local environment files.
- `AGENTS.md` records architecture, security, frozen product rules, and verification commands.
- `package-lock.json` is regenerated from the public npm registry.

## Verification contract

A release is ready only when all of these pass from a clean install:

```text
npm ci
npm run typecheck
npm test
npm run build
```
