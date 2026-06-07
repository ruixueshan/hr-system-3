# Cloud Function Common Layer

## Response helpers

Use `common/response.js` in business cloud functions:

```js
const { success, error } = require('../common/response');
```

Do not add new local `success()` or `error()` helpers in function entry files.

## Auth helpers

Use `common/auth.js` for token validation:

```js
const { verifyToken, withAuth } = require('../common/auth');
```

For legacy modules that expect `verifyToken(token)` to return a user or `null`, keep a small local adapter and delegate to `common/auth.js`:

```js
async function getUserFromToken(token) {
  const auth = await verifyToken(token, false);
  return auth.valid ? auth.userInfo : null;
}
```

## Migration order

1. Replace duplicated `success` / `error` first.
2. Replace duplicated `verifyToken` with an adapter that preserves existing return semantics.
3. After behavior is stable, migrate the function entry to `withAuth` when every action has the same authentication requirement.
