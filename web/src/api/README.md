# Web API Layer Rules

## Cloud function calls

- Feature modules must call CloudBase functions through `callFunction` from `src/api/cloud.ts`.
- Do not call `cloud.callFunction` directly outside `src/api/cloud.ts`.
- ESLint enforces this rule for `src/**/*.{ts,vue}` and excludes only the low-level wrapper.

## Direct database SDK access

Direct `getDatabase()` access is allowed only when there is a clear reason, such as:

- Read-heavy admin queries that need client-side joins while the matching cloud function is not yet available.
- Low-risk diagnostics and development tools.
- Existing code paths that are being migrated incrementally.

Prefer a cloud function when the operation:

- Writes or deletes business data.
- Requires cross-collection consistency.
- Depends on role-based authorization beyond CloudBase collection permissions.
- Needs server-side pagination, indexing, or audit logging.

When touching an API module, move direct writes toward cloud functions first. Keep direct reads only when the permission and performance tradeoff is explicit.
